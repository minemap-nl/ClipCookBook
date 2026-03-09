'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

export default function Login() {
    const { t } = useI18n();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                const params = new URLSearchParams(window.location.search);
                const from = params.get('from') || '/';
                window.location.href = from;
            } else {
                const data = await res.json();
                setError(data.error || t('loginFailed'));
            }
        } catch (err) {
            setError(t('connectionError'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh'
        }}>
            <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '40px 30px' }}>
                <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>{t('welcomeBack')}</h1>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '30px' }}>
                    {t('loginDesc')}
                </p>

                {error && (
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', fontWeight: '500' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '20px' }}>
                        <input
                            type="password"
                            placeholder={t('passwordPlaceholder')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            required
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '16px',
                                fontSize: '1.1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'rgba(0,0,0,0.2)',
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn"
                        disabled={loading}
                        style={{ width: '100%', padding: '16px', fontSize: '1.1rem', marginTop: '10px' }}
                    >
                        {loading ? t('loggingIn') : t('login')}
                    </button>
                </form>
            </div>
        </div>
    );
}
