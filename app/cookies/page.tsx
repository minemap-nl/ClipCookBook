'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

type CookieStatus = {
    configured: boolean;
    path: string;
    exists: boolean;
    mtime: string | null;
    size: number | null;
    hasSessionId: boolean | null;
    authVia?: string;
};

export default function CookiesPage() {
    const { isNL } = useI18n();
    const [status, setStatus] = useState<CookieStatus | null>(null);
    const [paste, setPaste] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const loadStatus = async () => {
        try {
            const res = await fetch('/api/admin/ytdlp-cookies', { credentials: 'include' });
            if (!res.ok) {
                setError(isNL ? 'Niet geautoriseerd of status ophalen mislukt.' : 'Unauthorized or failed to load status.');
                return;
            }
            setStatus(await res.json());
            setError('');
        } catch {
            setError(isNL ? 'Status ophalen mislukt.' : 'Failed to load status.');
        }
    };

    useEffect(() => {
        void loadStatus();
    }, []);

    const uploadText = async (cookies: string) => {
        setBusy(true);
        setMessage('');
        setError('');
        try {
            const res = await fetch('/api/admin/ytdlp-cookies', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookies }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || (isNL ? 'Upload mislukt' : 'Upload failed'));
                return;
            }
            setMessage(data.message || (isNL ? 'Cookies opgeslagen.' : 'Cookies saved.'));
            setPaste('');
            await loadStatus();
        } catch {
            setError(isNL ? 'Upload mislukt.' : 'Upload failed.');
        } finally {
            setBusy(false);
        }
    };

    const onFile = async (file: File | null) => {
        if (!file) return;
        const text = await file.text();
        await uploadText(text);
    };

    return (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ marginBottom: 16 }}>
                <Link href="/" className="btn btn-secondary" style={{ fontSize: '0.9rem' }}>
                    {isNL ? '← Terug' : '← Back'}
                </Link>
            </div>

            <h1 style={{ fontSize: '1.75rem' }}>
                {isNL ? 'Instagram cookies' : 'Instagram cookies'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
                {isNL
                    ? 'Nodig voor videodownloads van Instagram. Sessies verlopen; vernieuw ze hier of met het lokale hulpmiddel.'
                    : 'Required for Instagram video downloads. Sessions expire; refresh them here or with the local helper tool.'}
            </p>

            {status && (
                <div
                    style={{
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--border-radius-sm)',
                        padding: 16,
                        marginBottom: 24,
                        border: '1px solid var(--border-color)',
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        {status.exists
                            ? isNL
                                ? 'Status: cookies aanwezig'
                                : 'Status: cookies present'
                            : isNL
                              ? 'Status: geen cookiesbestand'
                              : 'Status: no cookies file'}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <div>
                            <strong>Pad:</strong> {status.path}
                        </div>
                        {status.mtime && (
                            <div>
                                <strong>{isNL ? 'Laatst bijgewerkt:' : 'Last updated:'}</strong>{' '}
                                {new Date(status.mtime).toLocaleString()}
                            </div>
                        )}
                        {status.hasSessionId != null && (
                            <div>
                                <strong>sessionid:</strong>{' '}
                                {status.hasSessionId
                                    ? isNL
                                        ? 'gevonden'
                                        : 'found'
                                    : isNL
                                      ? 'ontbreekt'
                                      : 'missing'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: '1.15rem' }}>
                    {isNL ? 'Uploaden / plakken' : 'Upload / paste'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 12 }}>
                    {isNL
                        ? 'Netscape cookies.txt (bijv. uit een browserextensie). Alleen vanaf thuis/LAN of als je bent ingelogd.'
                        : 'Netscape cookies.txt (e.g. from a browser extension). Only from home/LAN or when logged in.'}
                </p>
                <input
                    type="file"
                    accept=".txt,text/plain"
                    disabled={busy}
                    onChange={(e) => void onFile(e.target.files?.[0] || null)}
                    style={{ marginBottom: 12, display: 'block' }}
                />
                <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder="# Netscape HTTP Cookie File"
                    rows={8}
                    style={{
                        width: '100%',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '0.8rem',
                        padding: 12,
                        borderRadius: 'var(--border-radius-sm)',
                        border: '1px solid var(--border-color)',
                        marginBottom: 12,
                    }}
                />
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !paste.trim()}
                    onClick={() => void uploadText(paste)}
                >
                    {busy
                        ? isNL
                            ? 'Bezig…'
                            : 'Working…'
                        : isNL
                          ? 'Cookies opslaan'
                          : 'Save cookies'}
                </button>
                {message && (
                    <p style={{ color: 'var(--primary-color)', marginTop: 12, fontWeight: 500 }}>{message}</p>
                )}
                {error && <p style={{ color: '#c0392b', marginTop: 12 }}>{error}</p>}
            </section>

            <section>
                <h2 style={{ fontSize: '1.15rem' }}>
                    {isNL ? 'Lokaal hulpmiddel (aanbevolen)' : 'Local helper (recommended)'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 12 }}>
                    {isNL
                        ? 'Op je PC: opent een browser, jij logt in op Instagram, daarna worden cookies automatisch naar deze app gestuurd.'
                        : 'On your PC: opens a browser, you log into Instagram, then cookies are uploaded to this app automatically.'}
                </p>
                <pre
                    style={{
                        background: '#1e1e1e',
                        color: '#f0f0f0',
                        padding: 16,
                        borderRadius: 'var(--border-radius-sm)',
                        overflow: 'auto',
                        fontSize: '0.8rem',
                        lineHeight: 1.5,
                    }}
                >{`cd tools/instagram-cookies
bun install
bunx playwright install chromium
bun run refresh -- --url https://jouw-app-url --password "JE_SITE_WACHTWOORD"`}</pre>
                <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginTop: 12 }}>
                    {isNL
                        ? 'Tip: gebruik een apart Instagram-account. Sessies kunnen verlopen; bij een mail-alert dit opnieuw draaien.'
                        : 'Tip: use a dedicated Instagram account. Sessions may expire; re-run this when you get an alert email.'}
                </p>
            </section>
        </div>
    );
}
