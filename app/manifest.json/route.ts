import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const appName = process.env.APP_NAME || 'Social Recipe Saver';

    const manifest = {
        name: appName,
        short_name: appName,
        description: "Onze heerlijke familie receptendatabase.",
        start_url: "/",
        display: "standalone",
        background_color: "#F8F9FA",
        theme_color: "#FF5A5F",
        icons: [
            {
                src: "/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable"
            },
            {
                src: "/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
            }
        ],
        share_target: {
            action: "/toevoegen",
            method: "GET",
            enctype: "application/x-www-form-urlencoded",
            params: {
                title: "title",
                text: "text",
                url: "url"
            }
        }
    };

    return NextResponse.json(manifest);
}
