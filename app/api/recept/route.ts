import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export const dynamic = 'force-dynamic';

function sanitize(text: string | null | undefined) {
    if (!text) return "";
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    return purify.sanitize(text);
}

// Haal alle recepten op
export async function GET() {
    const recipes = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        include: { ingredients: true }
    });

    // Transform old static paths to API routes for standalone mode
    const transformed = recipes.map(r => ({
        ...r,
        thumbnailPath: r.thumbnailPath?.replace(/^\/thumbnails\//, '/api/thumbnail/') ?? null,
        videoPath: r.videoPath?.replace(/^\/videos\//, '/api/video/') ?? null,
    }));

    return NextResponse.json(transformed);
}

// Handmatig een recept toevoegen (Ondersteunt nu JSON én FormData voor video uploads)
export async function POST(req: Request) {
    try {
        const contentType = req.headers.get('content-type') || '';

        let title = "Naamloos Recept";
        let description = null;
        let tags = null;
        let portions = 4;
        let originalUrl = null;
        let ingredientsData: any[] = [];
        let stepsData: any[] = [];
        let videoPath: string | null = null;
        let thumbnailPath: string | null = null;
        let mediaGallery: string | null = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            title = formData.get('title') as string || "Naamloos Recept";
            description = formData.get('description') as string || null;
            tags = formData.get('tags') as string || null;
            portions = parseInt(formData.get('portions') as string || '4', 10);
            originalUrl = formData.get('originalUrl') as string || null;

            const ingredientsStr = formData.get('ingredients') as string;
            if (ingredientsStr) ingredientsData = JSON.parse(ingredientsStr);

            const stepsStr = formData.get('steps') as string;
            if (stepsStr) stepsData = JSON.parse(stepsStr);

            const mediaFiles = formData.getAll('mediaFiles') as File[];

            // Save media if present
            if (mediaFiles && mediaFiles.length > 0) {
                const crypto = require('crypto');
                const fs = require('fs/promises');
                const path = require('path');

                const videosDir = path.join(process.cwd(), 'public', 'videos');
                const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');

                // Ensure directories exist
                await fs.mkdir(videosDir, { recursive: true });
                await fs.mkdir(thumbsDir, { recursive: true });

                const savedMediaPaths: string[] = [];

                for (const file of mediaFiles) {
                    if (file.size === 0) continue;

                    const isVid = file.type.startsWith('video/');
                    const ext = path.extname(file.name) || (isVid ? '.mp4' : '.jpg');
                    const filename = crypto.randomUUID() + ext;

                    const targetDir = isVid ? videosDir : thumbsDir;
                    const apiPrefix = isVid ? '/api/video/' : '/api/thumbnail/';

                    const buffer = Buffer.from(await file.arrayBuffer());
                    await fs.writeFile(path.join(targetDir, filename), buffer);

                    savedMediaPaths.push(`${apiPrefix}${filename}`);
                }

                if (savedMediaPaths.length > 0) {
                    videoPath = savedMediaPaths.find(p => p.includes('/api/video/')) || null;
                    thumbnailPath = savedMediaPaths.find(p => p.includes('/api/thumbnail/')) || null;
                    mediaGallery = savedMediaPaths.join(',');
                }
            }

        } else {
            // Fallback for old JSON requests
            const data = await req.json();
            title = data.title || "Naamloos Recept";
            description = data.description || null;
            tags = data.tags || null;
            portions = data.portions ? parseInt(data.portions, 10) : 4;
            originalUrl = data.originalUrl || null;
            ingredientsData = data.ingredients || [];
            stepsData = data.steps || [];
        }

        const recipe = await prisma.recipe.create({
            data: {
                title: sanitize(title),
                description: description ? sanitize(description) : null,
                tags: sanitize(tags),
                portions: portions,
                originalUrl: originalUrl ? sanitize(originalUrl) : null,
                videoPath: videoPath,
                thumbnailPath: thumbnailPath,
                originalThumbnail: thumbnailPath,
                media: mediaGallery,
                ingredients: {
                    create: ingredientsData.map((i: any) => ({
                        name: sanitize(i.name),
                        amount: i.amount ? parseFloat(i.amount) : null,
                        unit: sanitize(i.unit || "")
                    }))
                },
                steps: {
                    create: stepsData.map((s: any, idx: number) => ({
                        description: sanitize(typeof s === 'string' ? s : s.description),
                        order: idx + 1
                    }))
                }
            }
        });
        return NextResponse.json({ success: true, recipeId: recipe.id });
    } catch (e: any) {
        return NextResponse.json({ error: "Kan recept niet toevoegen", details: e.message }, { status: 500 });
    }
}
