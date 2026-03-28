import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canonicalSourceUrl } from '@/lib/normalize-source-url';
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
    // Strip .mp4 to bypass IDM extension discovery
    const transformVid = (p: string | null) => {
        if (!p) return null;
        return p.replace(/^\/videos\//, '/api/v/')
                .replace(/^\/api\/video\//, '/api/v/')
                .replace(/\.mp4$/i, '');
    };

    const transformed = recipes.map(r => ({
        ...r,
        thumbnailPath: r.thumbnailPath?.replace(/^\/thumbnails\//, '/api/thumbnail/') ?? null,
        videoPath: transformVid(r.videoPath),
        media: r.media?.split(',').map(item => {
            const trimmed = item.trim();
            if (trimmed.includes('/api/v/') || trimmed.includes('/api/video/') || trimmed.includes('/videos/') || trimmed.match(/\.(mp4|mov|webm)$/i)) {
                return transformVid(trimmed);
            }
            return trimmed;
        }).join(',') ?? null,
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

            const thumbnailData = formData.get('thumbnail') as string;
            if (thumbnailData && thumbnailData.startsWith('data:image')) {
                const matches = thumbnailData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const crypto = require('crypto');
                    const fs = require('fs/promises');
                    const path = require('path');
                    const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');
                    await fs.mkdir(thumbsDir, { recursive: true });

                    const buffer = Buffer.from(matches[2], 'base64');
                    const filename = `crop-${crypto.randomUUID()}.jpg`;
                    await fs.writeFile(path.join(thumbsDir, filename), buffer);
                    thumbnailPath = `/api/thumbnail/${filename}`;
                }
            }

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
                    const apiPrefix = isVid ? '/api/v/' : '/api/thumbnail/';

                    const buffer = Buffer.from(await file.arrayBuffer());
                    await fs.writeFile(path.join(targetDir, filename), buffer);

                    savedMediaPaths.push(`${apiPrefix}${filename}`);
                }

                if (savedMediaPaths.length > 0) {
                    const v = savedMediaPaths.find(p => p.includes('/api/v/')) || null;
                    if (v) videoPath = v;
                    const thumbFromMedia = savedMediaPaths.find(p => p.includes('/api/thumbnail/')) || null;
                    if (thumbFromMedia) thumbnailPath = thumbFromMedia;
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
                originalUrl: originalUrl
                    ? /^\s*https?:\/\//i.test(originalUrl)
                        ? canonicalSourceUrl(originalUrl) || sanitize(originalUrl)
                        : sanitize(originalUrl)
                    : null,
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
