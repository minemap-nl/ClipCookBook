import { NextResponse } from 'next/server';
import ytDlp from 'yt-dlp-exec';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { extractRecipeData, extractRecipeDataAI, extractRecipeDataFromVideo } from '@/lib/extractor';
import { isAiProcessingEnabled } from '@/lib/process-method';
import { canonicalSourceUrl, normalizeSourceUrl } from '@/lib/normalize-source-url';
import { getSafeFetchUrl, safeFetch } from '@/lib/safe-url';
import { findExistingRecipeBySourceUrl } from '@/lib/find-recipe-by-source-url';
import { extractFrames } from '@/lib/ffmpeg';
import { fetchInstagramPublicMeta, isInstagramUrl } from '@/lib/instagram-public-meta';
import { formatYtdlpError, isYtdlpAuthError, withYtdlpCookies } from '@/lib/ytdlp-options';
import { noteYtdlpAuthOutcome } from '@/lib/ytdlp-cookies-alert';
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
        const res = await safeFetch(url);
        if (!res || !res.ok) return false;
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

            const res = await safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
            if (!res || !res.ok) throw new Error('Website kon niet worden opgehaald');
            const htmlText = await res.text();
            const window = new JSDOM(htmlText).window;
            const document = window.document;

            document.querySelectorAll("script, style, noscript, nav, footer, header").forEach(el => el.remove());
            const cleanText = document.body.textContent?.replace(/\s+/g, ' ').trim() || "";

            await prisma.importJob.update({
                where: { id: jobId },
                data: { message: isAiProcessingEnabled() ? "Recept via AI genereren..." : "Recept uit tekst halen..." },
            });
            if (isAiProcessingEnabled()) {
                extracted = await extractRecipeDataAI(cleanText);
            } else {
                extracted = extractRecipeData(cleanText);
            }

            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage && getSafeFetchUrl(ogImage)) {
                const ok = await downloadThumbnail(ogImage, thumbPath);
                if (ok) finalThumbnail = `/api/thumbnail/${thumbName}`;
            }

            finalTitle = document.title || extracted.title || "Recept van Website";
            finalDescription = extracted.description || null;
            finalTags = extracted.tags || [];
        } else {
            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Video-informatie ophalen..." } });

            let cleanDesc = '';
            let usedTextOnlyFallback = false;

            try {
                info = await ytDlp(url, withYtdlpCookies({ dumpSingleJson: true, noWarnings: true, noPlaylist: true }));
                cleanDesc = sanitize(info.description || info.title || '');
                await noteYtdlpAuthOutcome(true);
            } catch (ytErr) {
                if (isInstagramUrl(url) && isYtdlpAuthError(ytErr)) {
                    await noteYtdlpAuthOutcome(
                        false,
                        ytErr instanceof Error ? ytErr.message : String(ytErr)
                    );
                    console.warn('[extract] yt-dlp blocked for Instagram; trying public meta fallback');
                    await prisma.importJob.update({
                        where: { id: jobId },
                        data: { message: "Instagram blokkeert video; beschrijving ophalen..." },
                    });
                    const meta = await fetchInstagramPublicMeta(url);
                    cleanDesc = sanitize([meta.title, meta.description].filter(Boolean).join('\n\n'));
                    if (meta.thumbnailUrl) {
                        const ok = await downloadThumbnail(meta.thumbnailUrl, thumbPath);
                        if (ok) finalThumbnail = `/api/thumbnail/${thumbName}`;
                    }
                    info = { title: meta.title || undefined, portions: 4 };
                    usedTextOnlyFallback = true;
                    if (cleanDesc.replace(/#\w+/gi, '').replace(/https?:\/\/[^\s]+/gi, '').trim().length < 40) {
                        throw new Error(
                            'Instagram geeft geen video én geen bruikbare beschrijving zonder login. ' +
                                'Gebruik de foto-tab (screenshot van het recept) of voeg optioneel cookies toe voor videodownload.'
                        );
                    }
                } else {
                    if (isYtdlpAuthError(ytErr)) {
                        await noteYtdlpAuthOutcome(
                            false,
                            ytErr instanceof Error ? ytErr.message : String(ytErr)
                        );
                    }
                    throw ytErr;
                }
            }

            if (usedTextOnlyFallback) {
                await prisma.importJob.update({
                    where: { id: jobId },
                    data: { message: "Recept uit Instagram-beschrijving genereren (zonder video)..." },
                });
                if (isAiProcessingEnabled()) {
                    extracted = await extractRecipeDataAI(cleanDesc);
                } else {
                    extracted = extractRecipeData(cleanDesc);
                }
                finalTitle = extracted?.title || info?.title || "Nieuw Recept";
                finalDescription = extracted?.description || null;
                finalTags.push(...(extracted?.tags || []).filter((t: string) => !t.startsWith('_thumb')));
            } else {
            await prisma.importJob.update({ where: { id: jobId }, data: { message: "Video downloaden en recept schrijven..." } });

            const videoPromise = ytDlp(url, withYtdlpCookies({
                output: outputPath,
                format: 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/best[ext=mp4]/best',
                mergeOutputFormat: 'mp4',
                noPlaylist: true,
            })).then(async () => {
                finalVideoPath = `/api/v/${path.parse(videoName).name}`;
                await noteYtdlpAuthOutcome(true);
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
            }).catch(async (videoErr) => {
                if (isYtdlpAuthError(videoErr)) {
                    await noteYtdlpAuthOutcome(
                        false,
                        videoErr instanceof Error ? videoErr.message : String(videoErr)
                    );
                }
                throw videoErr;
            });

            const thumbPromise = (async () => {
                if (info.thumbnail && getSafeFetchUrl(info.thumbnail)) {
                    const ok = await downloadThumbnail(info.thumbnail, thumbPath);
                    if (ok) finalThumbnail = `/api/thumbnail/${thumbName}`;
                }
            })();

            const aiPromise = (async () => {
                if (isAiProcessingEnabled()) {
                    let contentToProcess = cleanDesc;
                    // External link logic...
                    const urlMatch = cleanDesc.match(/(https?:\/\/[^\s]+)/g);
                    if (urlMatch && urlMatch.length > 0) {
                        for (const foundUrl of urlMatch) {
                            const lowerUrl = foundUrl.toLowerCase();
                            if (!lowerUrl.includes('instagram.com') && !lowerUrl.includes('tiktok.com') && !lowerUrl.includes('youtu')) {
                                try {
                                    const fetchRes = await safeFetch(foundUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
                                    if (fetchRes?.ok) {
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

                    const usableTextLength = contentToProcess
                        .replace(/#\w+/gi, '')
                        .replace(/https?:\/\/[^\s]+/gi, '')
                        .trim().length;

                    // Deep Search / nearly empty captions: skip text AI and go straight to video analysis.
                    // Otherwise text AI may return "Gefilterd: geen recept" on empty fluff and abort before video.
                    if (deepSearch) {
                        console.log('[extract] Deep Search on — skipping text AI, using video AI.');
                        extracted = null;
                    } else if (usableTextLength < 40) {
                        console.log('[extract] Caption too short for text AI — using video AI.');
                        extracted = null;
                    } else {
                        try {
                            extracted = await extractRecipeDataAI(contentToProcess);
                        } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            // Substantial caption judged "not a recipe" → fail. Weak/empty-ish → try video AI.
                            if (/gefilterd|filtered/i.test(msg) && usableTextLength >= 100) {
                                throw e;
                            }
                            console.error('[extract] Text AI failed (will try video AI):', msg);
                            extracted = null;
                        }
                    }

                    try {
                        let isTextTooShort = usableTextLength < 100;
                        let hasNoUsefulData = false;

                        if (extracted) {
                            const hasNoIngredients = !extracted.ingredients || extracted.ingredients.length === 0;
                            const hasNoUsefulSteps = !extracted.steps || extracted.steps.length === 0;
                            hasNoUsefulData = hasNoIngredients || hasNoUsefulSteps || (extracted.steps.length === 1 && extracted.steps[0].length < 50);
                        }

                        if (deepSearch || hasNoUsefulData || isTextTooShort || !extracted) {
                            if (deepSearch) {
                                console.log("Deep Search requested. Triggering Video AI...");
                                await prisma.importJob.update({ where: { id: jobId }, data: { message: "Deep Search: audio & video analyseren (AI)... dit kan even duren." } });
                            } else {
                                console.log("Text insufficient or text AI inconclusive. Starting Video AI...");
                                await prisma.importJob.update({ where: { id: jobId }, data: { message: "Video bekijken (AI)... dit kan even duren." } });
                            }

                            await videoPromise;
                            extracted = await extractRecipeDataFromVideo(outputPath, contentToProcess);
                        }

                        if (!extracted) {
                            throw new Error(
                                'AI-extractie mislukt (tekst én video). Controleer GEMINI_API_KEY, quota en GEMINI_MODEL.'
                            );
                        }
                    } catch (err: any) {
                        console.error("Video AI failed:", err);
                        throw err;
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
                originalUrl: canonicalSourceUrl(url) || sanitize(url),
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
            data: { status: 'ERROR', error: formatYtdlpError(error), message: "Fout bij importeren" }
        });
    }
}

export async function POST(req: Request) {
    try {
        const { url, deepSearch } = await req.json();
        if (!url) return NextResponse.json({ error: "Geen URL meegegeven" }, { status: 400 });

        // Drop tracking params (igsh, utm_*, …) but keep content ids: YouTube ?v=, ?list=, ?t=, etc.
        const cleanUrl = normalizeSourceUrl(url);
        if (!getSafeFetchUrl(cleanUrl)) {
            return NextResponse.json({ error: "Ongeldige of niet-toegestane URL" }, { status: 400 });
        }

        const existingRecipe = await findExistingRecipeBySourceUrl(url);

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
