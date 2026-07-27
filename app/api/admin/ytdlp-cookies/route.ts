import { NextResponse } from 'next/server';
import { isTrustedAdminRequest } from '@/lib/request-trust';
import { readYtdlpCookiesStatus, validateNetscapeCookies, writeYtdlpCookiesFile } from '@/lib/ytdlp-options';
import { clearYtdlpCookiesAlertFlag } from '@/lib/ytdlp-cookies-alert';

export async function GET(req: Request) {
    const trust = await isTrustedAdminRequest(req);
    if (!trust.ok) {
        return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }
    const status = await readYtdlpCookiesStatus();
    return NextResponse.json({ ...status, authVia: trust.via });
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let cookiesText = '';
        let bodyPassword: string | undefined;

        if (contentType.includes('multipart/form-data')) {
            const form = await req.formData();
            bodyPassword = String(form.get('password') || '') || undefined;
            const file = form.get('file');
            const textField = form.get('cookies');
            if (file && typeof file === 'object' && 'text' in file) {
                cookiesText = await (file as File).text();
            } else if (typeof textField === 'string') {
                cookiesText = textField;
            }
        } else {
            const body = await req.json();
            cookiesText = typeof body.cookies === 'string' ? body.cookies : '';
            bodyPassword = typeof body.password === 'string' ? body.password : undefined;
        }

        const trust = await isTrustedAdminRequest(req, { bodyPassword });
        if (!trust.ok) {
            return NextResponse.json(
                { error: 'Niet geautoriseerd. Log in, gebruik SITE_PASSWORD, of verbind vanaf thuis/LAN.' },
                { status: 401 }
            );
        }

        const check = validateNetscapeCookies(cookiesText);
        if (!check.ok) {
            return NextResponse.json({ error: check.error }, { status: 400 });
        }

        const { path: savedPath } = await writeYtdlpCookiesFile(cookiesText);
        await clearYtdlpCookiesAlertFlag();

        return NextResponse.json({
            success: true,
            path: savedPath,
            lineCount: check.lineCount,
            hasSessionId: check.hasSessionId,
            hasDsUserId: check.hasDsUserId,
            authVia: trust.via,
            message: 'Cookies opgeslagen. Instagram-videodownloads gebruiken deze sessie nu.',
        });
    } catch (e) {
        console.error('[ytdlp-cookies] upload failed:', e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Upload mislukt' },
            { status: 500 }
        );
    }
}
