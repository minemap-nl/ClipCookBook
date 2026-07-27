import crypto from 'crypto';
import { isIP } from 'node:net';

let cachedHomePublicIp: string | null = null;
let lastIpFetchTime = 0;

export function verifyAuthToken(token: string): boolean {
    const secret =
        process.env.JWT_SECRET || (process.env.SITE_PASSWORD || '') + '__recepten_app_secret__';
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
}

function isPrivateIp(host: string): boolean {
    if (host === '::1' || host === '127.0.0.1' || host === 'localhost') return true;
    if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
    if (!isIP(host)) return false;
    return false;
}

async function getHomePublicIp(): Promise<string | null> {
    const now = Date.now();
    if (cachedHomePublicIp && now - lastIpFetchTime < 600_000) return cachedHomePublicIp;
    try {
        const res = await fetch('https://api.ipify.org?format=json', {
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return cachedHomePublicIp;
        const data = (await res.json()) as { ip?: string };
        if (data.ip) {
            cachedHomePublicIp = data.ip;
            lastIpFetchTime = now;
        }
    } catch {
        /* keep stale */
    }
    return cachedHomePublicIp;
}

export function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return (req.headers.get('x-real-ip') || '127.0.0.1').trim();
}

/** Site password via Authorization Bearer / X-Site-Password (for local helper CLI). */
export function hasValidSitePassword(req: Request, bodyPassword?: string): boolean {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) return false;
    const auth = req.headers.get('authorization');
    if (auth?.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === expected) return true;
    if (req.headers.get('x-site-password') === expected) return true;
    if (bodyPassword && bodyPassword === expected) return true;
    return false;
}

export function hasValidAuthCookie(req: Request): boolean {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)auth-token=([^;]+)/);
    if (!match) return false;
    try {
        return verifyAuthToken(decodeURIComponent(match[1]));
    } catch {
        return false;
    }
}

/**
 * Trusted for sensitive admin actions: logged-in session, site password header,
 * or request from home/LAN (same rules as proxy.ts).
 */
export async function isTrustedAdminRequest(
    req: Request,
    opts?: { bodyPassword?: string }
): Promise<{ ok: boolean; via: 'auth-cookie' | 'password' | 'home' | null }> {
    if (hasValidAuthCookie(req)) return { ok: true, via: 'auth-cookie' };
    if (hasValidSitePassword(req, opts?.bodyPassword)) return { ok: true, via: 'password' };

    const clientIp = getClientIp(req);
    if (isPrivateIp(clientIp)) return { ok: true, via: 'home' };
    const homeIp = await getHomePublicIp();
    if (homeIp && clientIp === homeIp) return { ok: true, via: 'home' };

    return { ok: false, via: null };
}
