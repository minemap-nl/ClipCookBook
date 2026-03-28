import path from 'path';
import fs from 'fs/promises';
import { getSmtpAlertTo, isSmtpConfigured, sendAdminAlertEmail } from '@/lib/smtp';

function statePath() {
    return path.join(process.cwd(), 'data', 'backup-failure-alert.json');
}

/** Call after a successful auto-backup so the next failure can trigger mail again. */
export async function clearBackupFailureAlertFlag() {
    await fs.unlink(statePath()).catch(() => {});
}

/**
 * E-mail at most once per backup-outage (until a backup succeeds).
 * Uses the same SMTP_ALERT_TO rules as media recovery.
 */
export async function maybeSendBackupFailureAlert(errorSummary: string) {
    try {
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
                '[ERROR] [Cron] Auto backup failed; SMTP not configured — alert e-mail skipped.'
            );
            console.error('[ERROR] [Cron] Backup error:', errorSummary);
            return;
        }
        if (!alertTo) {
            console.error(
                '[ERROR] [Cron] Auto backup failed; SMTP_ALERT_TO unset or invalid — alert e-mail skipped.'
            );
            console.error('[ERROR] [Cron] Backup error:', errorSummary);
            return;
        }

        const body = `Automatic database backup failed.

${errorSummary}

This alert is sent at most once until a backup succeeds again.`;

        const sent = await sendAdminAlertEmail(
            `[${process.env.APP_NAME || 'Recepten'}] Database backup mislukt`,
            body
        );
        if (sent) {
            await fs.mkdir(path.dirname(statePath()), { recursive: true });
            await fs.writeFile(statePath(), JSON.stringify({ notified: true }), 'utf8');
            console.log(`[INFO] [Cron] Backup failure alert sent to ${alertTo}.`);
        } else {
            console.error('[ERROR] [Cron] Backup failure alert could not be sent (sendAdminAlertEmail returned false).');
        }
    } catch (e) {
        console.error('[ERROR] [Cron] Backup failure alert helper failed:', e instanceof Error ? e.message : e);
    }
}
