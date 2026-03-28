import nodemailer from 'nodemailer';

/** Loose sanity check; invalid addresses skip alert mail and log [ERROR]. */
const ALERT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getSmtpAlertTo(): string | null {
    const raw = process.env.SMTP_ALERT_TO?.trim();
    if (!raw || !ALERT_EMAIL_RE.test(raw)) return null;
    return raw;
}

export function getSmtpTransporter() {
    const smtpPort = parseInt(process.env.SMTP_PORT || '1025', 10);
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: smtpPort,
        secure: smtpPort === 465,
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
            : undefined,
        tls: { rejectUnauthorized: false },
    });
}

/** Enough to send mail (host + from address). */
export function isSmtpConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function escapeHtml(s: string) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Ops / cron alerts (missing media, backup failures). Requires valid SMTP_ALERT_TO + SMTP_HOST + SMTP_USER. */
export async function sendAdminAlertEmail(subject: string, textBody: string, htmlBody?: string) {
    const to = getSmtpAlertTo();
    if (!to || !isSmtpConfigured()) return false;
    const appName = process.env.APP_NAME || 'ReteraRecepten';
    const transporter = getSmtpTransporter();
    try {
        await transporter.sendMail({
            from: `"${appName} (alert)" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: textBody,
            html: htmlBody ?? `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(textBody)}</pre>`,
        });
        return true;
    } catch (e) {
        console.error(
            '[ERROR] [SMTP] sendAdminAlertEmail failed:',
            e instanceof Error ? e.message : e
        );
        return false;
    }
}
