import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { getSmtpAlertTo, isSmtpConfigured, sendAdminAlertEmail } from '@/lib/smtp';

/** Same format preference as `app/api/extract/route.ts` for consistent MP4 output. */
const YT_DLP_FORMAT =
    'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/best[ext=mp4]/best';

function alertStatePath() {
    return path.join(process.cwd(), 'data', 'media-missing-alert.json');
}

type AlertState = { sentWhileMissing: boolean };

type RecipeRecoveryRow = {
    id: string;
    title: string;
    videoPath: string | null;
    media: string | null;
    originalUrl: string | null;
};

async function readAlertState(): Promise<AlertState | null> {
    try {
        const raw = await fs.readFile(alertStatePath(), 'utf8');
        return JSON.parse(raw) as AlertState;
    } catch {
        return null;
    }
}

async function writeAlertState(s: AlertState) {
    await fs.mkdir(path.dirname(alertStatePath()), { recursive: true });
    await fs.writeFile(alertStatePath(), JSON.stringify(s), 'utf8');
}

async function clearAlertState() {
    await fs.unlink(alertStatePath()).catch(() => {});
}

function isVideoRef(p: string): boolean {
    const t = p.trim();
    if (!t || t.startsWith('data:')) return false;
    if (t.startsWith('http://') || t.startsWith('https://')) return true;
    return (
        t.includes('/api/v/') ||
        t.includes('/api/video/') ||
        t.includes('/videos/') ||
        /\.(mp4|mov|webm)$/i.test(t)
    );
}

/** Candidate filenames under public/videos for a local path ref (DB may omit extension). Order: prefer .mp4 for writes. */
function localVideoRefToDiskNames(ref: string): string[] {
    const trimmed = ref.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://'))
        return [];
    let pathOnly = trimmed;
    try {
        pathOnly = new URL(trimmed, 'https://placeholder.invalid').pathname;
    } catch {
        pathOnly = trimmed.split('#')[0].split('?')[0];
    }
    const base = path.basename(pathOnly);
    if (!base) return [];
    if (path.extname(base)) return [base];
    return [base + '.mp4', base + '.mov', base + '.webm', base];
}

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function isRecoverableOriginalUrl(trimmed: string): boolean {
    if (!trimmed || trimmed.length < 12) return false;
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
        const parsed = new URL(trimmed);
        return !!parsed.hostname && parsed.hostname.includes('.');
    } catch {
        return false;
    }
}

async function tryYtdlpToFile(sourceUrl: string, destPath: string): Promise<boolean> {
    try {
        const ytDlp = (await import('yt-dlp-exec')).default;
        await ytDlp(sourceUrl, {
            output: destPath,
            format: YT_DLP_FORMAT,
            mergeOutputFormat: 'mp4',
            noPlaylist: true,
            noWarnings: true,
        });
        if (await fileExists(destPath)) return true;
        console.error(
            `[ERROR] [MediaRecovery] yt-dlp finished but output missing: ${destPath} (source=${sourceUrl})`
        );
        return false;
    } catch (e) {
        console.error(
            `[ERROR] [MediaRecovery] yt-dlp failed (source=${sourceUrl}):`,
            e instanceof Error ? e.message : e
        );
        return false;
    }
}

export type MediaRecoveryResult = {
    recovered: number;
    stillMissing: { recipeId: string; title: string; ref: string; triedUrls: string[] }[];
};

/**
 * Restores missing video files via yt-dlp from recipe.originalUrl (Instagram, TikTok, YouTube, …)
 * into the expected filename under public/videos. No separate file mirror — only DB backups are assumed.
 */
export async function runMissingMediaRecovery(): Promise<MediaRecoveryResult> {
    const videosDir = path.join(process.cwd(), 'public', 'videos');

    const recipes = await prisma.recipe.findMany({
        select: { id: true, title: true, videoPath: true, media: true, originalUrl: true },
    });

    const stillMissing: MediaRecoveryResult['stillMissing'] = [];
    let recovered = 0;

    const seen = new Set<string>();

    const processRef = async (recipe: RecipeRecoveryRow, ref: string) => {
        const key = `${recipe.id}|${ref}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (!isVideoRef(ref)) return;

        const trimmed = ref.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return;

        const diskNames = localVideoRefToDiskNames(trimmed);
        if (diskNames.length === 0) return;

        const destPath = path.join(videosDir, diskNames[0]);
        for (const name of diskNames) {
            const p = path.join(videosDir, name);
            if (await fileExists(p)) return;
        }

        const triedUrls: string[] = [];
        let ok = false;

        const ouTrim = (recipe.originalUrl ?? '').trim();
        if (isRecoverableOriginalUrl(ouTrim)) {
            triedUrls.push(`yt-dlp:${ouTrim}`);
            ok = await tryYtdlpToFile(ouTrim, destPath);
        } else if (ouTrim) {
            triedUrls.push('(originalUrl not a usable http(s) URL — skipped yt-dlp)');
        } else {
            triedUrls.push('(no originalUrl — cannot yt-dlp)');
        }

        if (ok) {
            recovered++;
            return;
        }

        stillMissing.push({ recipeId: recipe.id, title: recipe.title, ref: trimmed, triedUrls });
    };

    for (const r of recipes) {
        if (r.videoPath) await processRef(r, r.videoPath);
        if (r.media) {
            for (const part of r.media.split(',')) {
                const p = part.trim();
                if (p) await processRef(r, p);
            }
        }
    }

    return { recovered, stillMissing };
}

function logStillMissingDetails(result: MediaRecoveryResult) {
    console.error(
        `[ERROR] [MediaRecovery] ${result.stillMissing.length} video file(s) still missing after recovery (recovered this run: ${result.recovered}).`
    );
    for (const m of result.stillMissing) {
        const tried = m.triedUrls.length > 0 ? m.triedUrls.join(' | ') : '(nothing attempted)';
        console.error(
            `[ERROR] [MediaRecovery]   recipe="${m.title}" id=${m.recipeId} ref=${m.ref} tried=${tried}`
        );
    }
}

/**
 * One aggregated admin e-mail per outage. Requires valid SMTP_ALERT_TO; otherwise only [ERROR] logs.
 */
export async function maybeSendMissingMediaAlert(result: MediaRecoveryResult) {
    if (result.stillMissing.length === 0) {
        await clearAlertState();
        return;
    }

    const state = await readAlertState();
    if (state?.sentWhileMissing) return;

    const alertTo = getSmtpAlertTo();

    if (!isSmtpConfigured()) {
        console.error(
            '[ERROR] [MediaRecovery] Missing videos; SMTP not configured (need SMTP_HOST and SMTP_USER) — alert e-mail skipped.'
        );
        logStillMissingDetails(result);
        return;
    }

    if (!alertTo) {
        console.error(
            '[ERROR] [MediaRecovery] Missing videos; SMTP_ALERT_TO unset or invalid — alert e-mail skipped.'
        );
        logStillMissingDetails(result);
        return;
    }

    const lines = result.stillMissing.map(
        (m) =>
            `- ${m.title} (${m.recipeId})\n  ref: ${m.ref}\n  tried: ${m.triedUrls.length ? m.triedUrls.join(' | ') : '(nothing to try)'}`
    );
    const body = `Some recipe videos are still missing after yt-dlp recovery (originalUrl).

Recovered in this run: ${result.recovered}

Still missing (${result.stillMissing.length}):
${lines.join('\n\n')}

Check originalUrl, yt-dlp in the container/host, and re-upload if the source is gone.

This message is sent at most once until all referenced videos exist again.`;

    try {
        const sent = await sendAdminAlertEmail(
            `[${process.env.APP_NAME || 'Recepten'}] Ontbrekende video’s`,
            body
        );
        if (sent) {
            await writeAlertState({ sentWhileMissing: true });
            console.log(`[INFO] [MediaRecovery] Missing-media alert sent to ${alertTo}.`);
        } else {
            console.error('[ERROR] [MediaRecovery] sendAdminAlertEmail returned false — alert not sent.');
            logStillMissingDetails(result);
        }
    } catch (e) {
        console.error(
            '[ERROR] [MediaRecovery] Failed to send missing-media alert:',
            e instanceof Error ? e.message : e
        );
        logStillMissingDetails(result);
    }
}
