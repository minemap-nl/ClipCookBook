import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    const appName = process.env.APP_NAME || 'ClipCookBook';

    return {
        name: appName,
        short_name: appName,
        description: 'Onze heerlijke familie receptendatabase.',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8F9FA',
        theme_color: '#FF5A5F',
        icons: [
            {
                src: '/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable'
            },
            {
                src: '/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
            }
        ],
        // @ts-ignore - share_target wordt officieel nog niet perfect ondersteund door Next.js TypeScript, maar werkt in de browser wel!
        share_target: {
            action: '/toevoegen',
            method: 'GET',
            enctype: 'application/x-www-form-urlencoded',
            params: {
                title: 'title',
                text: 'text',
                url: 'url'
            }
        }
    };
}