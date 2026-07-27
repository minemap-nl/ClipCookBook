import { execFile } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);

export type YtdlpUpdateResult = {
    ok: boolean;
    skipped: boolean;
    versionBefore?: string;
    versionAfter?: string;
    message?: string;
};

function isAutoUpdateEnabled(): boolean {
    return process.env.YT_DLP_AUTO_UPDATE !== 'false';
}

function getYtdlpExecPackageRoot(): string {
    // Static string — avoids webpack "Critical dependency" from require(variable).
    return path.dirname(requireFromHere.resolve('yt-dlp-exec/package.json'));
}

/** Path to the yt-dlp binary bundled by yt-dlp-exec. */
export function getYtdlpBinaryPath(): string {
    const file = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    return path.join(getYtdlpExecPackageRoot(), 'bin', file);
}

/** Path to yt-dlp-exec postinstall script (re-downloads latest release). */
export function getYtdlpPostinstallScriptPath(): string {
    return path.join(getYtdlpExecPackageRoot(), 'scripts', 'postinstall.js');
}

export async function getYtdlpVersion(binaryPath = getYtdlpBinaryPath()): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 15_000 });
        return stdout.trim().split('\n')[0] || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Update yt-dlp: try self-update (`-U`), then fall back to re-running yt-dlp-exec postinstall.
 * Set `YT_DLP_AUTO_UPDATE=false` to disable.
 */
export async function updateYtdlp(reason = 'scheduled'): Promise<YtdlpUpdateResult> {
    if (!isAutoUpdateEnabled()) {
        return { ok: true, skipped: true, message: 'YT_DLP_AUTO_UPDATE=false' };
    }

    const binaryPath = getYtdlpBinaryPath();
    const versionBefore = await getYtdlpVersion(binaryPath);

    try {
        const { stdout, stderr } = await execFileAsync(binaryPath, ['-U'], {
            timeout: 180_000,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        const combined = `${stdout}\n${stderr}`.trim();
        const versionAfter = (await getYtdlpVersion(binaryPath)) ?? versionBefore;
        console.log(
            `[yt-dlp] Update (${reason}): ${versionBefore ?? 'unknown'} -> ${versionAfter ?? 'unknown'}${combined ? ` — ${combined.split('\n')[0]}` : ''}`
        );
        return {
            ok: true,
            skipped: false,
            versionBefore,
            versionAfter,
            message: combined || undefined,
        };
    } catch (selfUpdateError) {
        console.warn(
            `[yt-dlp] Self-update failed (${reason}), trying postinstall fallback:`,
            selfUpdateError instanceof Error ? selfUpdateError.message : selfUpdateError
        );
    }

    try {
        const postinstall = getYtdlpPostinstallScriptPath();
        await execFileAsync(process.execPath, [postinstall], {
            timeout: 180_000,
            env: { ...process.env, YOUTUBE_DL_SKIP_DOWNLOAD: '' },
        });
        const versionAfter = await getYtdlpVersion(binaryPath);
        console.log(
            `[yt-dlp] Postinstall fallback (${reason}): ${versionBefore ?? 'unknown'} -> ${versionAfter ?? 'unknown'}`
        );
        return {
            ok: true,
            skipped: false,
            versionBefore,
            versionAfter,
            message: 'postinstall fallback',
        };
    } catch (fallbackError) {
        const message =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.error(`[yt-dlp] Update failed (${reason}):`, message);
        return { ok: false, skipped: false, versionBefore, message };
    }
}

/** Milliseconds until the next occurrence of `hour` (0–23) in local time. */
export function msUntilNextLocalHour(hour: number, now = new Date()): number {
    const h = Math.min(23, Math.max(0, Math.floor(hour)));
    const next = new Date(now);
    next.setHours(h, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
}
