import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: process.env.APP_NAME || 'Social Recipe Saver',
    description: 'Jouw eigen levendige receptencollectie',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: process.env.APP_NAME || 'Social Recipe Saver'
    }
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="nl">
            <body>
                <header className="header">
                    <Link href="/" className="header-brand">
                        <span>{process.env.APP_NAME || 'Social Recipe Saver'}</span>
                    </Link>
                    <nav>
                        <Link href="/toevoegen" className="btn btn-secondary header-add-btn">
                            + Toevoegen
                        </Link>
                    </nav>
                </header>

                <main className="container animate-in">
                    {children}
                </main>
            </body>
        </html>
    );
}
