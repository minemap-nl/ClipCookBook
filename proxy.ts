import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

// Update this list with any public static files or routes you want to exclude from the login check
const publicPaths = ['/login', '/api/login', '/share/', '/manifest.json', '/favicon.ico', '/icon-', '/apple-icon'];

// Verify HMAC-signed auth token (must match the token generated in /api/login)
function verifyAuthToken(token: string): boolean {
    const secret = process.env.JWT_SECRET || ((process.env.SITE_PASSWORD || '') + '__recepten_app_secret__');
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
}

let cachedHomePublicIp: string | null = null;
let lastIpFetchTime = 0;

// Fetch the server's own public IP (the home network IP)
async function getHomePublicIp(): Promise<string | null> {
    const now = Date.now();
    // Cache for 10 minutes (600,000 ms) to avoid spamming the API
    if (cachedHomePublicIp && (now - lastIpFetchTime < 600000)) {
        return cachedHomePublicIp;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
        const res = await fetch('https://api.ipify.org?format=json', {
            signal: controller.signal,
            // Next.js fetch cache options if available in Edge
            next: { revalidate: 600 }
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data.ip) {
                cachedHomePublicIp = data.ip;
                lastIpFetchTime = now;
                console.log(`[Proxy] Updated home public IP: ${cachedHomePublicIp}`);
                return cachedHomePublicIp;
            }
        }
    } catch (e) {
        console.error("[Proxy] Failed to fetch home public IP:", e instanceof Error ? e.message : e);
    }

    return cachedHomePublicIp; // Return stale cache if fetch fails
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if the current path is a public path
    if (publicPaths.some(path => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    // Allow static assets (_next/static, _next/image) and optionally media streams over API
    if (pathname.startsWith('/_next/') || pathname.includes('.') || pathname.startsWith('/api/thumbnail') || pathname.startsWith('/api/video')) {
        return NextResponse.next();
    }

    // Get the IP address
    // Track headers explicitly for debugging Cloudflare Tunnels
    console.log(`[Proxy] Incoming request for: ${pathname}`);
    console.log(`[Proxy Headers] cf-connecting-ip:`, request.headers.get('cf-connecting-ip'));
    console.log(`[Proxy Headers] x-real-ip:`, request.headers.get('x-real-ip'));
    console.log(`[Proxy Headers] x-forwarded-for:`, request.headers.get('x-forwarded-for'));
    const allHeaders = Object.fromEntries(request.headers.entries());
    console.log(`[Proxy All Headers]:`, JSON.stringify(allHeaders));

    // If specific Cloudflare headers are present, the request came through Cloudflare (external)
    const isCloudflare = !!request.headers.get('cf-ray') || !!request.headers.get('cdn-loop');

    // Get the IP address
    // x-forwarded-for generally holds the real external IP, even if CF-Connecting-IP is missing
    const ip = request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        request.headers.get('host') ||
        request.nextUrl.hostname ||
        '127.0.0.1';

    // Extract the first IP
    const clientIp = ip.split(',')[0].trim();

    // Fetch the home public IP asynchronously
    const homePublicIp = await getHomePublicIp();

    // Check if IP is local/private
    // Local IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
    // Local IPv6: ::1, fe80::/10, fc00::/7, fd00::/8
    const isLocalIp = clientIp === '::1' ||
        clientIp === '127.0.0.1' ||
        clientIp.startsWith('localhost') ||
        clientIp.startsWith('192.168.') ||
        clientIp.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clientIp) ||
        clientIp.startsWith('fe80:') ||
        clientIp.startsWith('fc00:') ||
        clientIp.startsWith('fd00:');

    // Here is the crucial difference:
    // If the user connects to https://recepten.famretera.nl while ON the local WiFi,
    // their modem/router often loops it back (NAT hairpinning) OR Cloudflare sees their IP
    // as the public IP of the router, NOT 192.168.x.x!
    // If the clientIp explicitly matches our fetched home public IP, we're explicitly from home.

    const isHomePublicIp = !!homePublicIp && clientIp === homePublicIp;

    // Safari Specific: iCloud Private Relay often masks the user's real IP with an Apple Proxy IP.
    // We can try to detect this in headers, but if they use Private Relay, their 
    // IP will NEVER match `homePublicIp`, meaning they must log in once.
    // However, if they land on a local 192.168.x.x alias without Cloudflare, it should still work.

    const isLocal = isLocalIp || isHomePublicIp;

    // If it's truly local (or matches the home public IP), we skip authentication
    if (isLocal) {
        return NextResponse.next();
    }

    // Not local, check for auth token
    const authToken = request.cookies.get('auth-token')?.value;

    if (authToken && verifyAuthToken(authToken)) {
        return NextResponse.next();
    }

    // Not authenticated and not local, redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/login
         * - api/thumbnail
         * - api/video
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, manifest.json, etc
         */
        '/((?!api/login|api/upload/media|api/thumbnail|api/video|_next/static|_next/image|favicon.ico|manifest.json).*)',
    ],
};
