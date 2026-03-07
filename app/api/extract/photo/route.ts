import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { prisma } from '@/lib/prisma';
import { extractRecipeDataFromImages } from '@/lib/extractor';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export const maxDuration = 300; // Allows Vercel hobby plan to run for 5 minutes if needed

function sanitize(text: string | null | undefined) {
    if (!text) return "";
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    return purify.sanitize(text);
}

export async function POST(req: Request) {
    if (process.env.PROCESS_METHOD !== 'ai') {
        return NextResponse.json({ error: "AI verwerking staat momenteel uit." }, { status: 403 });
    }

    try {
        const formData = await req.formData();
        const files = formData.getAll('photos') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: "Geen foto's geselecteerd" }, { status: 400 });
        }

        // --- Rate Limiting Protection ---
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const recentJobsCount = await prisma.importJob.count({
            where: { createdAt: { gte: fifteenMinutesAgo } }
        });

        if (recentJobsCount >= 10) {
            return NextResponse.json({ error: "Rate limit overschreden. Probeer het later opnieuw." }, { status: 429 });
        }

        // Job record aanmaken voor feedback (al gaat dit in 1 req, het is netjes voor logging)
        const job = await prisma.importJob.create({
            data: {
                url: 'photo-upload-' + Date.now(),
                status: 'PROCESSING',
                message: 'Foto(s) uploaden en analyseren...'
            }
        });

        const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir, { recursive: true });
        }

        const savedFilePaths: string[] = [];
        const savedFileNames: string[] = [];

        for (const file of files) {
            // Validate mimetype
            if (!file.type.startsWith('image/')) {
                await prisma.importJob.update({ where: { id: job.id }, data: { status: 'ERROR', error: "Ongeldig bestandstype." } });
                return NextResponse.json({ error: "Ongeldig bestandstype. Alleen foto's (image/*)." }, { status: 400 });
            }

            const ext = path.extname(file.name) || '.jpg';
            const id = crypto.randomUUID();
            const thumbName = `${id}${ext}`;
            const thumbPath = path.join(thumbsDir, thumbName);

            const buffer = Buffer.from(await file.arrayBuffer());
            fs.writeFileSync(thumbPath, buffer);

            savedFilePaths.push(thumbPath);
            savedFileNames.push(`/api/thumbnail/${thumbName}`);
        }

        // --- Start AI Extractie ---
        await prisma.importJob.update({ where: { id: job.id }, data: { message: "AI analyseert foto('s)... dit kan even duren." } });

        let extracted;
        try {
            extracted = await extractRecipeDataFromImages(savedFilePaths, "");
        } catch (e: any) {
            await prisma.importJob.update({ where: { id: job.id }, data: { status: 'ERROR', error: e.message } });

            // If it's our structured "Not a recipe" error, return a 400 Bad Request instead of a 500 server crash
            if (e.message && e.message.toLowerCase().includes("geen recept of voedsel")) {
                return NextResponse.json({ error: e.message }, { status: 400 });
            }

            return NextResponse.json({ error: "Fout bij de AI foto analyse", details: e.message }, { status: 500 });
        }

        let finalTitle = sanitize(extracted?.title || "Nieuw Recept uit Foto's");
        let finalDescription = extracted?.description ? sanitize(extracted.description) : null;
        let finalTags = extracted?.tags || [];

        let primaryThumbnail = savedFileNames.length > 0 ? savedFileNames[0] : null;
        let suggestedThumbnails = savedFileNames.length > 0 ? savedFileNames.join(',') : null;

        await prisma.importJob.update({ where: { id: job.id }, data: { message: "Recept opslaan..." } });

        // Save to database
        const recipe = await prisma.recipe.create({
            data: {
                title: finalTitle,
                description: finalDescription,
                tags: finalTags.length > 0 ? sanitize(finalTags.join(',')) : null,
                originalUrl: "Handmatige Foto Upload",
                videoPath: null,
                thumbnailPath: primaryThumbnail,
                originalThumbnail: primaryThumbnail,
                suggestedThumbnails: suggestedThumbnails,
                media: suggestedThumbnails,
                portions: extracted?.portions || 4,
                ingredients: {
                    create: (extracted?.ingredients || []).map((i: any) => ({
                        name: sanitize(i.name),
                        amount: i.amount,
                        unit: sanitize(i.unit || "")
                    }))
                },
                steps: {
                    create: (extracted?.steps || []).map((s: any, idx: number) => ({
                        description: sanitize(s),
                        order: idx + 1
                    }))
                }
            }
        });

        await prisma.importJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETED', recipeId: recipe.id, message: "Klaar!" }
        });

        return NextResponse.json({ success: true, recipeId: recipe.id });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Fout bij upload", details: error.message }, { status: 500 });
    }
}
