import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Let's set the expected single password from environment variables
const EXPECTED_PASSWORD = process.env.SITE_PASSWORD;

// --- Rate Limiting voor Login ---
// Max 10 pogingen per 5 minuten per IP
const loginRateLimitMap = new Map<string, { count: number, resetTime: number }>();
const LOGIN_RATE_LIMIT = 10;
const LOGIN_TIME_WINDOW_MS = 5 * 60 * 1000;

function checkLoginRateLimit(req: Request) {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    const record = loginRateLimitMap.get(ip);
    if (!record || record.resetTime < now) {
        loginRateLimitMap.set(ip, { count: 1, resetTime: now + LOGIN_TIME_WINDOW_MS });
        return true;
    }

    if (record.count >= LOGIN_RATE_LIMIT) {
        return false;
    }

    record.count++;
    return true;
}

// Generate a signed token that can be verified by middleware
function generateAuthToken(): string {
    // JWT_SECRET is explicitly safer, fallback to SITE_PASSWORD for easy deployments
    const secret = process.env.JWT_SECRET || ((process.env.SITE_PASSWORD || '') + '__recepten_app_secret__');
    const payload = 'authenticated';
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
}

export function verifyAuthToken(token: string): boolean {
    const secret = process.env.JWT_SECRET || ((process.env.SITE_PASSWORD || '') + '__recepten_app_secret__');
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
}

export async function POST(request: Request) {
    // 1. Check Rate Limit
    if (!checkLoginRateLimit(request)) {
        return NextResponse.json({ error: 'Te veel inlogpogingen. Probeer het over 5 minuten opnieuw.' }, { status: 429 });
    }

    try {
        const body = await request.json();
        const { password } = body;

        if (!EXPECTED_PASSWORD) {
            console.error("SITE_PASSWORD is not set in the environment variables.");
            return NextResponse.json({ error: 'Server niet goed geconfigureerd.' }, { status: 500 });
        }

        if (password === EXPECTED_PASSWORD) {
            // Password is correct, create a success response
            const response = NextResponse.json({ success: true });

            // Set the auth-token cookie with a signed value
            response.cookies.set({
                name: 'auth-token',
                value: generateAuthToken(),
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
                path: '/',
            });

            return response;
        } else {
            return NextResponse.json({ error: 'Ongeldig wachtwoord.' }, { status: 401 });
        }
    } catch (e) {
        return NextResponse.json({ error: 'Fout bij het verwerken van het verzoek.' }, { status: 500 });
    }
}
