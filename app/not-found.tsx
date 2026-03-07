'use client';

import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="container-narrow" style={{ paddingTop: '60px', textAlign: 'center' }}>
            <div className="card" style={{ padding: '50px 30px' }}>
                <h1 style={{ fontSize: '4rem', marginBottom: '10px', color: 'var(--primary-color)' }}>404</h1>
                <h2 style={{ fontSize: '1.4rem', marginBottom: '15px', color: 'var(--text-primary)' }}>Pagina niet gevonden</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.6' }}>
                    Oeps! Deze pagina bestaat niet (meer). Misschien is het recept verwijderd of klopt de link niet.
                </p>
                <Link href="/" className="btn" style={{ padding: '12px 30px', fontSize: '1rem' }}>
                    ← Terug naar recepten
                </Link>
            </div>
        </div>
    );
}
