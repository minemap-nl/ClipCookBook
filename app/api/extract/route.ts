import { NextResponse } from 'next/server';
import ytDlp from 'yt-dlp-exec';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { extractRecipeData, extractRecipeDataAI, extractRecipeDataFromVideo } from '@/lib/extractor';
import { extractFrames } from '@/lib/ffmpeg';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export const maxDuration = 300;

function sanitize(text: string | null | undefined) {
    if (!text) return "";
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    return purify.sanitize(text);
}

// Download een afbeelding van een URL en sla hem lokaal op
async function downloadThumbnail(url: string, destPath: string): Promise<boolean> {
    try {
        const res = await fetch(url);
        if (!res.ok) return false;
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        return true;
    } catch {
        return false;
    }
}

async function processJob(jobId: string, url: string, deepSearch: boolean = false) {
    try {
        const id = crypto.randomUUID();
        const videoName = `${id}.mp4`;
        const thumbName = `${id}.jpg`;
        const videosDir = path.join(process.cwd(), 'public', 'videos');
        const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');
        const outputPath = path.join(videosDir, videoName);
        const thumbPath = path.join(thumbsDir, thumbName);

        if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

        const isVideoPlatform = url.includes('instagram.com') || url.includes('youtube.com') || url.includes('youtu.be') || url.includes('tiktok.com');

        let extracted: any;
        let finalTitle = "Nieuw Recept";
        let finalDescription: string | null = null;
        let finalTags: string[] = [];
        let finalThumbnail: string | null = null;
        let finalVideoPath: string | null = null;

        let info: any = null;
        if (!isVideoPlatform) {
            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Website analyseren..." } });

            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
            const htmlText = await res.text();
            const window = new JSDOM(htmlText).window;
            const document = window.document;

            document.querySelectorAll("script, style, noscript, nav, footer, header").forEach(el => el.remove());
            const cleanText = document.body.textContent?.replace(/\s+/g, ' ').trim() || "";

            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Recept via AI genereren..." } });
            extracted = await extractRecipeDataAI(cleanText);

            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage) {
                const ok = await downloadThumbnail(ogImage, thumbPath);
                if (ok) finalThumbnail = `/api/thumbnail/${thumbName}`;
            }

            finalTitle = document.title || extracted.title || "Recept van Website";
            finalDescription = extracted.description || null;
            finalTags = extracted.tags || [];
        } else {
            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Video-informatie ophalen..." } });
            info = await ytDlp(url, { dumpSingleJson: true, noWarnings: true });
            const description = info.description || info.title || "";
            const cleanDesc = sanitize(description);

            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Video downloaden en recept schrijven..." } });

            const videoPromise = ytDlp(url, {
                output: outputPath,
                format: 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/best[ext=mp4]/best',
                mergeOutputFormat: 'mp4',
            }).then(async () => {
                finalVideoPath = `/api/video/${videoName}`;
                // Extract 3 suggested frames
                try {
                    const extractedThumbs = await extractFrames(outputPath, 'public/thumbnails', `suggest-${id}`);
                    if (extractedThumbs.length > 0) {
                        finalTags.push(`_thumb1:${extractedThumbs[0]}`);
                        if (extractedThumbs.length > 1) finalTags.push(`_thumb2:${extractedThumbs[1]}`);
                        if (extractedThumbs.length > 2) finalTags.push(`_thumb3:${extractedThumbs[2]}`);
                    }
                } catch (e) {
                    console.error("Frame extraction error", e);
                }
            });

            const thumbPromise = (async () => {
                if (info.thumbnail) {
                    const ok = await downloadThumbnail(info.thumbnail, thumbPath);
                    if (ok) finalThumbnail = `/api/thumbnail/${thumbName}`;
                }
            })();

            const aiPromise = (async () => {
                if (process.env.PROCESS_METHOD === 'ai') {
                    let contentToProcess = cleanDesc;
                    // External link logic...
                    const urlMatch = cleanDesc.match(/(https?:\/\/[^\s]+)/g);
                    if (urlMatch && urlMatch.length > 0) {
                        for (const foundUrl of urlMatch) {
                            const lowerUrl = foundUrl.toLowerCase();
                            if (!lowerUrl.includes('instagram.com') && !lowerUrl.includes('tiktok.com') && !lowerUrl.includes('youtu')) {
                                try {
                                    const fetchRes = await fetch(foundUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
                                    if (fetchRes.ok) {
                                        const html = await fetchRes.text();
                                        const win = new JSDOM(html).window;
                                        win.document.querySelectorAll("script, style, noscript, nav, footer, header").forEach(el => el.remove());
                                        const extra = win.document.body.textContent?.replace(/\s+/g, ' ').trim() || "";
                                        contentToProcess += "\n\n--- EXTRA ---\n" + extra.substring(0, 4000);
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }
                    }

                    try {
                        extracted = await extractRecipeDataAI(contentToProcess);
                    } catch (e) {
                        extracted = extractRecipeData(cleanDesc);
                    }

                    try {
                        // Smart Fallback checks 
                        let isTextTooShort = false;
                        let hasNoUsefulData = false;

                        if (extracted) {
                            const cleanTextLength = contentToProcess.replace(/#\w+/gi, '').replace(/https?:\/\/[^\s]+/gi, '').trim().length;
                            isTextTooShort = cleanTextLength < 100;
                            const hasNoIngredients = !extracted.ingredients || extracted.ingredients.length === 0;
                            const hasNoUsefulSteps = !extracted.steps || extracted.steps.length === 0;
                            // Also flag if steps has 1 item and it's suspiciously short (could be a catch-all for bad unstructured data)
                            hasNoUsefulData = hasNoIngredients || hasNoUsefulSteps || (extracted.steps.length === 1 && extracted.steps[0].length < 50);
                        }

                        if (deepSearch || hasNoUsefulData || isTextTooShort || !extracted) {
                            if (deepSearch) {
                                console.log("Deep Search requested. Triggering Video AI directly...");
                                await prisma.importJob.update({ where: { id: jobId }, data: { message: "Deep Search geselecteerd: Audio & video analyseren (AI)... dit kan even duren." } });
                            } else {
                                console.log("Text info insufficient. Starting Video AI Fallback...");
                                await prisma.importJob.update({ where: { id: jobId }, data: { message: "De beschrijving bevatte onvoldoende informatie. Video bekijken (AI)... dit kan even duren." } });
                            }

                            // Wait for the video download to finish first
                            await videoPromise;
                            // If deepSearch was true, 'extracted' from text might be junk or skipped. Overwrite it completely.
                            extracted = await extractRecipeDataFromVideo(outputPath, contentToProcess);
                        }
                    } catch (err: any) {
                        console.error("Video AI Fallback faalde:", err);
                        if (err.message && err.message.includes("Geen recept")) {
                            throw err; // Abort entire import job
                        }
                    }

                } else {
                    extracted = extractRecipeData(cleanDesc);
                }
            })();

            await Promise.all([videoPromise, thumbPromise, aiPromise]);

            finalTitle = extracted?.title || info.title || "Nieuw Recept";
            finalDescription = extracted?.description || null;
            // Filter out the hidden thumb tags before saving to real tags, and store them separately
            const userTags = (extracted?.tags || []).filter((t: string) => !t.startsWith('_thumb'));
            finalTags.push(...userTags);
        }

        const pureTags = finalTags.filter(t => !t.startsWith('_thumb')).filter(t => t.trim().length > 0);
        const suggestedThumbs = finalTags.filter(t => t.startsWith('_thumb')).map(t => t.split(':')[1]);

        await prisma.importJob.update({ where: { id: jobId }, data: { message: "Recept opslaan..." } });

        const recipe = await prisma.recipe.create({
            data: {
                title: sanitize(finalTitle),
                description: finalDescription ? sanitize(finalDescription) : null,
                tags: pureTags.length > 0 ? pureTags.join(',') : null,
                suggestedThumbnails: suggestedThumbs.length > 0 ? suggestedThumbs.join(',') : null,
                originalUrl: sanitize(url),
                videoPath: finalVideoPath,
                thumbnailPath: finalThumbnail,
                originalThumbnail: finalThumbnail,
                portions: extracted?.portions || info.portions || 4,
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
            where: { id: jobId },
            data: { status: 'COMPLETED', recipeId: recipe.id, message: "Klaar!" }
        });

    } catch (error: any) {
        console.error("Background job failed:", error);
        await prisma.importJob.update({
            where: { id: jobId },
            data: { status: 'ERROR', error: error.message || "Onbekende fout", message: "Fout bij importeren" }
        });
    }
}

export async function POST(req: Request) {
    try {
        const { url, deepSearch } = await req.json();
        if (!url) return NextResponse.json({ error: "Geen URL meegegeven" }, { status: 400 });

        // Strip query parameters to prevent duplicates like ?igsh=...
        let cleanUrl = url;
        try {
            const parsedUrl = new URL(url);
            // Reconstruct without query params
            cleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
        } catch (e) {
            // If it's not a valid URL structure, leave it as is
        }

        // Check if we already have this recipe in the database (or if an older one starts with this base URL)
        const existingRecipe = await prisma.recipe.findFirst({
            where: {
                originalUrl: {
                    startsWith: cleanUrl
                }
            }
        });

        if (existingRecipe) {
            // Already exists, return the existing recipe ID immediately
            return NextResponse.json({
                success: true,
                jobId: null,
                recipeId: existingRecipe.id,
                message: "Recept was al eerder geïmporteerd."
            });
        }

        // --- Rate Limiting Protection ---
        // Prevent abuse by limiting the number of extractions to 10 per 15 minutes.
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const recentJobsCount = await prisma.importJob.count({
            where: {
                createdAt: {
                    gte: fifteenMinutesAgo
                }
            }
        });

        if (recentJobsCount >= 10) {
            return NextResponse.json(
                { error: "Rate limit overschreden. Wacht astublieft een kwartier voordat je meer recepten importeert om overbelasting te voorkomen." },
                { status: 429 }
            );
        }
        // --------------------------------

        // Check if there is already an active job for this URL to prevent rapid double-clicks
        const activeJob = await prisma.importJob.findFirst({
            where: {
                url: cleanUrl,
                status: { in: ['PENDING', 'PROCESSING'] }
            }
        });

        if (activeJob) {
            return NextResponse.json({
                success: true,
                jobId: activeJob.id,
                message: "Dit recept staat al in de wachtrij."
            });
        }


        // Create the background job immediately
        const job = await prisma.importJob.create({
            data: {
                url: cleanUrl,
                status: 'PROCESSING',
                message: 'Wachten in wachtrij...',
                deepSearch: deepSearch || false // Add deepSearch to the job creation
            }
        });

        // Fire and forget the background process
        processJob(job.id, cleanUrl, deepSearch || false).catch(console.error); // Pass deepSearch to processJob

        return NextResponse.json({ success: true, jobId: job.id, message: "Import gestart in wachtrij." });

    } catch (error: any) {
        return NextResponse.json({ error: "Kan import-taak niet aanmaken", details: error.message }, { status: 500 });
    }
}
