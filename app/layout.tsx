import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import Image from 'next/image';
import { LanguageProvider } from '@/lib/i18n';
import { getTranslation } from '@/lib/translations';

export const dynamic = 'force-dynamic';

const lang = (process.env.LANGUAGE || 'en').toLowerCase();

export const metadata: Metadata = {
    title: process.env.APP_NAME || 'ClipCookBook',
    description: getTranslation('metaDescription', lang),
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: process.env.APP_NAME || 'ClipCookBook'
    }
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang={lang}>
            <body>
                <LanguageProvider lang={lang}>
                    <header className="header">
                        <Link href="/" className="header-brand flex items-center">
                            <Image
                                src="/logo.svg"
                                alt="ClipCookBook Logo"
                                width={45}
                                height={45}
                                className="object-contain"
                                priority
                            />
                            <span style={{ marginLeft: '10px' }}>{process.env.APP_NAME || 'ClipCookBook'}</span>
                        </Link>
                        <nav className="flex items-center gap-4">
                            <Link href="/toevoegen" className="btn btn-secondary header-add-btn">
                                {getTranslation('add', lang)}
                            </Link>
                        </nav>
                    </header>

                    <main className="container animate-in">
                        {children}
                    </main>
                </LanguageProvider>
            </body>
        </html>
    );
}