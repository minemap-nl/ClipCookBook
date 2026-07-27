import path from 'path';
import fs from 'fs/promises';
import { getSmtpAlertTo, isSmtpConfigured, sendAdminAlertEmail } from '@/lib/smtp';
import { areYtdlpCookiesConfigured, getYtdlpCookiesPath } from '@/lib/ytdlp-options';

function statePath() {
    return path.join(process.cwd(), 'data', 'ytdlp-cookies-alert.json');
}

/** Call after a successful authenticated yt-dlp run so the next cookie failure can mail again. */
export async function clearYtdlpCookiesAlertFlag() {
    await fs.unlink(statePath()).catch(() => {});
}

/**
 * E-mail at most once while cookies are broken (until a cookie-backed download succeeds again).
 * No-op when YT_DLP_COOKIES is unset (anonymous Instagram failure is expected).
 */
export async function maybeSendYtdlpCookiesAlert(errorSummary: string) {
    try {
        if (!areYtdlpCookiesConfigured()) return;

        try {
            const raw = await fs.readFile(statePath(), 'utf8');
            const s = JSON.parse(raw) as { notified?: boolean };
            if (s?.notified) return;
        } catch {
            /* no state file */
        }

        const alertTo = getSmtpAlertTo();
        if (!isSmtpConfigured()) {
            console.error(
                '[ERROR] [yt-dlp] Cookies appear invalid/expired; SMTP not configured — alert e-mail skipped.'
            );
            console.error('[ERROR] [yt-dlp] Cookie error:', errorSummary);
            return;
        }
        if (!alertTo) {
            console.error(
                '[ERROR] [yt-dlp] Cookies appear invalid/expired; SMTP_ALERT_TO unset or invalid — alert e-mail skipped.'
            );
            console.error('[ERROR] [yt-dlp] Cookie error:', errorSummary);
            return;
        }

        const cookiePath = getYtdlpCookiesPath() || '(unknown path)';
        const body = `yt-dlp cookies seem invalid or expired.

Cookie file (YT_DLP_COOKIES): ${cookiePath}

${errorSummary}

Export a fresh Netscape cookies.txt from a logged-in browser session and replace the file.
This alert is sent at most once until a cookie-backed download succeeds again.`;

        const sent = await sendAdminAlertEmail(
            `[${process.env.APP_NAME || 'Recepten'}] yt-dlp cookies verlopen`,
            body
        );
        if (sent) {
            await fs.mkdir(path.dirname(statePath()), { recursive: true });
            await fs.writeFile(statePath(), JSON.stringify({ notified: true }), 'utf8');
            console.log(`[INFO] [yt-dlp] Cookie failure alert sent to ${alertTo}.`);
        } else {
            console.error(
                '[ERROR] [yt-dlp] Cookie failure alert could not be sent (sendAdminAlertEmail returned false).'
            );
        }
    } catch (e) {
        console.error(
            '[ERROR] [yt-dlp] Cookie failure alert helper failed:',
            e instanceof Error ? e.message : e
        );
    }
}

/** Notify (once) on auth errors when cookies are configured; clear flag on success. */
export async function noteYtdlpAuthOutcome(ok: boolean, errorSummary?: string) {
    if (!areYtdlpCookiesConfigured()) return;
    if (ok) {
        await clearYtdlpCookiesAlertFlag();
        return;
    }
    await maybeSendYtdlpCookiesAlert(errorSummary || 'Authentication / empty media response from yt-dlp.');
}
