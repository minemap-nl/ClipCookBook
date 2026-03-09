'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
    const { t } = useI18n();
    return (
        <div className="container-narrow" style={{ paddingTop: '60px', textAlign: 'center' }}>
            <div className="card" style={{ padding: '50px 30px' }}>
                <h1 style={{ fontSize: '4rem', marginBottom: '10px', color: 'var(--primary-color)' }}>404</h1>
                <h2 style={{ fontSize: '1.4rem', marginBottom: '15px', color: 'var(--text-primary)' }}>{t('pageNotFound')}</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.6' }}>
                    {t('pageNotFoundDesc')}
                </p>
                <Link href="/" className="btn" style={{ padding: '12px 30px', fontSize: '1rem' }}>
                    {t('backToRecipes')}
                </Link>
            </div>
        </div>
    );
}
