import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

// Simpele in-memory rate limiter per IP (max 100 requests per kwartier)
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT = 100;
const TIME_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(req: Request) {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const windowStart = now - TIME_WINDOW_MS;

    const record = rateLimitMap.get(ip);
    if (!record || record.resetTime < now) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + TIME_WINDOW_MS });
        return true;
    }

    if (record.count >= RATE_LIMIT) {
        return false;
    }

    record.count++;
    return true;
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
    if (!checkRateLimit(req)) {
        return NextResponse.json({ error: "Te veel aanvragen, probeer het later opnieuw" }, { status: 429 });
    }

    const params = await props.params;
    const recipe = await prisma.recipe.findUnique({
        where: { id: params.id },
        include: { ingredients: true, steps: { orderBy: { order: 'asc' } } }
    });

    if (!recipe) return NextResponse.json({ error: "Recept niet gevonden" }, { status: 404 });

    // Transform old static paths to API routes for standalone mode
    // Strip .mp4 to bypass IDM extension discovery
    const transformVid = (p: string | null) => {
        if (!p) return null;
        return p.replace(/^\/videos\//, '/api/v/')
                .replace(/^\/api\/video\//, '/api/v/')
                .replace(/\.mp4$/i, '');
    };

    const transformed = {
        ...recipe,
        thumbnailPath: recipe.thumbnailPath?.replace(/^\/thumbnails\//, '/api/thumbnail/') ?? null,
        videoPath: transformVid(recipe.videoPath),
        media: recipe.media?.split(',').map(item => {
            const trimmed = item.trim();
            if (trimmed.includes('/api/v/') || trimmed.includes('/api/video/') || trimmed.includes('/videos/') || trimmed.match(/\.(mp4|mov|webm)$/i)) {
                return transformVid(trimmed);
            }
            return trimmed;
        }).join(',') ?? null,
    };

    return NextResponse.json(transformed);
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const body = await req.json();
        const { title, description, tags, portions, ingredients, steps, thumbnailPath, suggestedThumbnails, editMedia } = body;

        let finalThumbnailPath: string | undefined | null = undefined;
        let finalVideoPath: string | undefined | null = undefined;
        let finalMediaGallery: string | undefined | null = undefined;

        // Normal path extraction if editMedia is used for other galleries
        if (editMedia && Array.isArray(editMedia)) {
            finalVideoPath = editMedia.find((url: string) => url.includes('/api/v/') || url.match(/\.(mp4|mov|webm)$/i)) || null;
            finalMediaGallery = editMedia.join(',');
        }

        // Deal with Thumbnail specifically
        if (typeof thumbnailPath !== 'undefined') {
            finalThumbnailPath = thumbnailPath;
        }

        // Allow legacy base64 if it's the incoming thumbnailPath
        if (finalThumbnailPath && finalThumbnailPath.startsWith('data:image')) {
            const matches = finalThumbnailPath.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const fileName = `custom-thumb-${params.id}-${Date.now()}.jpg`;
                const filePath = path.join(process.cwd(), 'public', 'thumbnails', fileName);

                await fs.mkdir(path.join(process.cwd(), 'public', 'thumbnails'), { recursive: true });
                await fs.writeFile(filePath, buffer);
                finalThumbnailPath = `/api/thumbnail/${fileName}`;

                // Replace the base64 string in finalMediaGallery with the real path, if it exists there
                if (finalMediaGallery) {
                    finalMediaGallery = editMedia.map((url: string) => url.startsWith('data:image') ? finalThumbnailPath : url).join(',');
                }
            }
        }

        // --- NEW: Process suggestedThumbnails for base64 data ---
        let finalSuggestedThumbnails = suggestedThumbnails;
        if (finalSuggestedThumbnails) {
            let sugList: string[] = [];
            if (Array.isArray(finalSuggestedThumbnails)) {
                sugList = finalSuggestedThumbnails;
            } else if (typeof finalSuggestedThumbnails === 'string') {
                sugList = finalSuggestedThumbnails.split(',').map((s: string) => s.trim()).filter(Boolean);
            }

            const processedList = [];
            for (let i = 0; i < sugList.length; i++) {
                const item = sugList[i];
                if (item.startsWith('data:image')) {
                    const matches = item.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        const buffer = Buffer.from(matches[2], 'base64');
                        const fileName = `suggest-thumb-${params.id}-${Date.now()}-${i}.jpg`;
                        const filePath = path.join(process.cwd(), 'public', 'thumbnails', fileName);
                        
                        await fs.mkdir(path.join(process.cwd(), 'public', 'thumbnails'), { recursive: true });
                        await fs.writeFile(filePath, buffer);
                        processedList.push(`/api/thumbnail/${fileName}`);
                    } else {
                        processedList.push(item);
                    }
                } else {
                    processedList.push(item);
                }
            }
            finalSuggestedThumbnails = processedList.join(',');
        }

        const recipe = await prisma.$transaction(async (tx) => {
            const currentRecipe = await tx.recipe.findUnique({ where: { id: params.id } });

            const updateData: any = {
                title,
                description,
                tags,
                portions,
            };

            if (finalThumbnailPath !== undefined) {
                updateData.thumbnailPath = finalThumbnailPath;
                // Preserve the current thumbnail as originalThumbnail if it hasn't been saved yet (for old recipes)
                if (currentRecipe && !currentRecipe.originalThumbnail && currentRecipe.thumbnailPath) {
                    updateData.originalThumbnail = currentRecipe.thumbnailPath;
                }
            }
            if (finalVideoPath !== undefined) {
                updateData.videoPath = finalVideoPath;
            }
            if (finalMediaGallery !== undefined) {
                updateData.media = finalMediaGallery;
            }
            if (finalSuggestedThumbnails !== undefined) {
                updateData.suggestedThumbnails = finalSuggestedThumbnails;
            }

            // Update title, desc, tags & portions
            await tx.recipe.update({
                where: { id: params.id },
                data: updateData
            });

            // Hermaak ingrediënten
            await tx.ingredient.deleteMany({ where: { recipeId: params.id } });
            if (ingredients?.length > 0) {
                await tx.ingredient.createMany({
                    data: ingredients.map((i: any) => ({
                        recipeId: params.id,
                        name: i.name || '',
                        amount: i.amount !== null && i.amount !== '' ? parseFloat(i.amount) : null,
                        unit: i.unit || ''
                    }))
                });
            }

            // Hermaak stappen
            await tx.step.deleteMany({ where: { recipeId: params.id } });
            if (steps?.length > 0) {
                await tx.step.createMany({
                    data: steps.map((s: any, idx: number) => ({
                        recipeId: params.id,
                        description: s.description || '',
                        order: idx + 1
                    }))
                });
            }

            return tx.recipe.findUnique({
                where: { id: params.id },
                include: { ingredients: true, steps: { orderBy: { order: 'asc' } } }
            });
        });

        return NextResponse.json(recipe);
    } catch (e: any) {
        console.error("Update error:", e);
        return NextResponse.json({ error: "Fout bij opslaan", details: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const params = await props.params;
        const recipe = await prisma.recipe.findUnique({ where: { id: params.id } });
        if (!recipe) return NextResponse.json({ error: "Recept niet gevonden" }, { status: 404 });

        // Helper function for safe deletion of local files
        const deleteLocalFile = async (filePath: string | null | undefined, baseDir: 'videos' | 'thumbnails') => {
            if (!filePath) return;
            // Ignore external URLs or base64 data
            if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) return;

            const stem = path.basename(filePath.split('?')[0].split('#')[0]);
            if (!stem || stem === '.' || stem === '..') return;

            const fullDir = path.resolve(process.cwd(), 'public', baseDir);
            const diskNames =
                baseDir === 'videos' && !path.extname(stem)
                    ? [stem, `${stem}.mp4`, `${stem}.mov`, `${stem}.webm`]
                    : [stem];

            const tried = new Set<string>();
            for (const name of diskNames) {
                const bn = path.basename(name);
                if (tried.has(bn)) continue;
                tried.add(bn);
                const fileFullPath = path.resolve(fullDir, bn);
                const rel = path.relative(fullDir, fileFullPath);
                if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
                await fs.unlink(fileFullPath).catch(() => {
                    console.log(`Bestand kon niet gevonden of verwijderd worden: ${fileFullPath}`);
                });
            }
        };

        // 1. Verwijder het videobestand
        if (recipe.videoPath) {
            await deleteLocalFile(recipe.videoPath, 'videos');
        }

        // 2. Verwijder de thumbnail(s)
        await deleteLocalFile(recipe.thumbnailPath, 'thumbnails');
        await deleteLocalFile(recipe.originalThumbnail, 'thumbnails');

        // 3. Verwijder suggestedThumbnails
        if (recipe.suggestedThumbnails) {
            const suggested = recipe.suggestedThumbnails.split(',');
            for (const imgPath of suggested) {
                await deleteLocalFile(imgPath.trim(), 'thumbnails');
            }
        }

        // 4. Verwijder images in de media gallery
        if (recipe.media) {
            const mediaItems = recipe.media.split(',');
            for (const imgPath of mediaItems) {
                // Determine if it's a video or a thumbnail based on its path/extension.
                // Normally videoPath is the central video, but media may contain it too.
                const dir = (imgPath.includes('/api/v/') || imgPath.match(/\.(mp4|mov|webm)$/i)) ? 'videos' : 'thumbnails';
                await deleteLocalFile(imgPath.trim(), dir);
            }
        }

        await prisma.recipe.delete({ where: { id: params.id } });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Delete error:", e);
        return NextResponse.json({ error: "Fout bij verwijderen van recept" }, { status: 500 });
    }
}
