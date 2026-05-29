import { isIP } from 'node:net';
import { hrefIfHttpUrl } from '@/lib/normalize-source-url';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata.google',
    'kubernetes.default.svc',
]);

function isPrivateIpv4(host: string): boolean {
    if (!isIP(host)) return false;
    if (isIP(host) === 6) {
        const h = host.toLowerCase();
        return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:');
    }
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 127 || a === 0) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

/** Returns a normalized http(s) URL safe for server-side fetch, or null if blocked (SSRF). */
export function getSafeFetchUrl(raw: string): string | null {
    const href = hrefIfHttpUrl(raw.trim());
    if (!href) return null;

    const { hostname, username, password } = new URL(href);
    if (username || password) return null;

    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (BLOCKED_HOSTNAMES.has(host)) return null;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null;
    if (isPrivateIpv4(host)) return null;

    return href;
}

const MAX_REDIRECTS = 5;

/** fetch with SSRF checks on the initial URL and each redirect target. */
export async function safeFetch(raw: string, init?: RequestInit): Promise<Response | null> {
    let url = getSafeFetchUrl(raw);
    if (!url) return null;

    let response: Response | undefined;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        response = await fetch(url, { ...init, redirect: 'manual' });
        if (response.status < 300 || response.status >= 400) return response;

        const location = response.headers.get('location');
        if (!location) return response;

        const next = getSafeFetchUrl(new URL(location, url).href);
        if (!next) return null;
        url = next;
    }
    return null;
}
