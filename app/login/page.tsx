'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Login() {
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
                // Determine where to redirect
                const params = new URLSearchParams(window.location.search);
                const from = params.get('from') || '/';

                // Force a hard refresh on successful login to ensure middleware cookies are properly loaded
                // This fixes an issue in iOS Chrome/Safari where the cache would prevent immediate access
                window.location.href = from;
            } else {
                const data = await res.json();
                setError(data.error || 'Login mislukt.');
            }
        } catch (err) {
            setError('Fout bij het verbinden met de server.');
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
                <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>Welkom terug!</h1>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '30px' }}>
                    Voer het wachtwoord in om toegang te krijgen tot de recepten database.
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
                            placeholder="Wachtwoord"
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
                        {loading ? 'Bezig...' : 'Inloggen'}
                    </button>
                </form>
            </div>
        </div>
    );
}
