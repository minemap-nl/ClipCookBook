'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { buildTimerRegex, parseTimeToMs } from '@/lib/timerParser';

let globalAlarmAudio: HTMLAudioElement | null = null;

const getAlarmAudio = () => {
    if (typeof window === 'undefined') return null;
    if (!globalAlarmAudio) {
        globalAlarmAudio = new Audio('/wekker_geluid.mp3');
        globalAlarmAudio.loop = true;
    }
    return globalAlarmAudio;
};

const unlockAudio = () => {
    const audio = getAlarmAudio();
    if (audio) {
        audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
        }).catch(() => { });
    }
};

const playAlarmSound = () => {
    const audio = getAlarmAudio();
    if (audio && audio.paused) {
        audio.play().catch(e => console.error("Audio play error", e));
    }
};

const stopAlarmSound = () => {
    const audio = getAlarmAudio();
    if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
    }
};

export default function ReceptDetail() {
    const { t, isNL } = useI18n();
    const { id } = useParams();
    const router = useRouter();

    const [recipe, setRecipe] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [targetPortions, setTargetPortions] = useState(4);
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
    const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
    const [wakeLockSentinel, setWakeLockSentinel] = useState<any>(null);

    const [emailOpen, setEmailOpen] = useState(false);
    const [emailAddress, setEmailAddress] = useState('');
    const [emailStatus, setEmailStatus] = useState('');

    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [currentCarouselIndex, setCurrentCarouselIndex] = useState<number>(0);

    // Video synchronization & state
    const videoRefs = React.useRef<{ [key: number]: HTMLVideoElement | null }>({});
    const videoTimes = React.useRef<{ [key: number]: number }>({});

    const handleTimeUpdate = (index: number, time: number) => {
        videoTimes.current[index] = time;
    };

    const handlePlay = (index: number) => {
        // Pause all other videos
        Object.keys(videoRefs.current).forEach(key => {
            const idx = parseInt(key, 10);
            if (idx !== index) {
                const vid = videoRefs.current[idx];
                if (vid && !vid.paused) vid.pause();
            }
        });
    };

    // Pause hidden videos & restore time when navigating the carousel
    useEffect(() => {
        // Pause all videos that are not the current one
        Object.keys(videoRefs.current).forEach(key => {
            const idx = parseInt(key, 10);
            const vid = videoRefs.current[idx];
            if (vid && idx !== currentCarouselIndex && !vid.paused) {
                vid.pause();
            }
        });
        // Restore saved time for the new active video
        const vid = videoRefs.current[currentCarouselIndex];
        if (vid && videoTimes.current[currentCarouselIndex] !== undefined) {
            if (Math.abs(vid.currentTime - videoTimes.current[currentCarouselIndex]) > 0.5) {
                vid.currentTime = videoTimes.current[currentCarouselIndex];
            }
        }
    }, [currentCarouselIndex]);

    const allMedia = useMemo(() => {
        if (!recipe) return [] as string[];

        let media: string[] = [];

        // Gebruik de 'media' kolom als deze is ingevuld by the user
        if (recipe.media) {
            media = recipe.media.split(',').map((s: string) => s.trim()).filter(Boolean);
        }

        // Zorg dat de hoofdvideo altijd onderdeel is van de media galerij als die bestaat
        const video = recipe.videoPath;
        if (video && !media.includes(video)) {
            media.unshift(video);
        }

        return Array.from(new Set(media)) as string[];
    }, [recipe]);

    // Active timers map: string (id) -> endDate (number, epoch ms)
    const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
    const [, setTick] = useState(0);
    const [toast, setToast] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    useEffect(() => {
        fetch(`/api/recept/${id}`, { credentials: 'include' })
            .then(r => {
                if (!r.ok) throw new Error(isNL ? "Oeps, niet gevonden" : "Oops, not found");
                return r.json();
            })
            .then(data => {
                setRecipe(data);
                setTargetPortions(data.portions || 4);
                setLoading(false);
            })
            .catch(e => {
                setErrorMsg(e.message);
                setLoading(false);
            });
    }, [id]);

    const toggleCheck = (idx: number) => {
        setCheckedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleCheckStep = (idx: number) => {
        setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleWakeLock = async () => {
        if (!('wakeLock' in navigator)) {
            alert(isNL ? 'Je browser ondersteunt Kookmodus (Wake Lock) niet.' : 'Your browser does not support Cook Mode (Wake Lock).');
            return;
        }

        try {
            if (wakeLockEnabled && wakeLockSentinel) {
                await wakeLockSentinel.release();
                setWakeLockSentinel(null);
                setWakeLockEnabled(false);
            } else {
                const sentinel = await (navigator as any).wakeLock.request('screen');
                setWakeLockSentinel(sentinel);
                setWakeLockEnabled(true);

                sentinel.addEventListener('release', () => {
                    setWakeLockEnabled(false);
                    setWakeLockSentinel(null);
                });
            }
        } catch (err) {
            console.error('Wake Lock ERROR', err);
            alert(isNL ? 'Kon kookmodus niet activeren.' : 'Could not activate cook mode.');
        }
    };

    const scaleAmount = (amount: number | null, startPortions: number) => {
        if (amount === null) return '';
        if (startPortions === 0) return amount;
        const scaled = (amount / startPortions) * targetPortions;
        return Number.isInteger(scaled) ? scaled : scaled.toFixed(1).replace('.', ',');
    };

    const handleDelete = async () => {
        if (!confirm(isNL ? "Weet je zeker dat je dit recept wil weggooien?" : "Are you sure you want to delete this recipe?")) return;
        try {
            await fetch(`/api/recept/${id}`, { method: 'DELETE', credentials: 'include' });
            router.push('/');
        } catch (e) {
            alert(isNL ? "Kan niet verwijderen" : "Cannot delete");
        }
    };

    const sendEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailStatus(t('sending'));
        try {
            const res = await fetch('/api/email', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId: id, targetEmail: emailAddress })
            });
            if (res.ok) {
                setEmailStatus(isNL ? '✅ Succesvol verstuurd!' : '✅ Successfully sent!');
                setTimeout(() => setEmailOpen(false), 2000);
            } else {
                const err = await res.json();
                setEmailStatus((isNL ? '❌ Fout: ' : '❌ Error: ') + (err.error || (isNL ? 'Onbekend' : 'Unknown')));
            }
        } catch (e) {
            setEmailStatus(isNL ? '❌ Netwerkfout' : '❌ Network error');
        }
    };

    const startTimer = (id: string, msDuration: number) => {
        unlockAudio(); // Unlock audio context on user interaction (fixes iOS Safari)
        setActiveTimers(prev => ({ ...prev, [id]: Date.now() + msDuration }));
    };

    const stopTimer = (id: string) => {
        setActiveTimers(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    // Timer tick effect
    useEffect(() => {
        if (Object.keys(activeTimers).length === 0) {
            stopAlarmSound();
            return;
        }

        const interval = setInterval(() => {
            setTick(t => t + 1);

            let isRinging = false;
            const now = Date.now();
            Object.values(activeTimers).forEach(endTime => {
                if (endTime <= now) {
                    isRinging = true;
                }
            });

            if (isRinging) {
                playAlarmSound();
            } else {
                stopAlarmSound();
            }
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [activeTimers]);

    useEffect(() => {
        return () => stopAlarmSound();
    }, []);

    // Format remaining time
    const formatTimeRemaining = (endTime: number) => {
        const remainingStr = endTime - Date.now();
        if (remainingStr <= 0) return isNL ? 'Klaar!' : 'Done!';

        const totalSeconds = Math.floor(remainingStr / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (loading) return <div className="spinner" style={{ margin: '50px auto', borderTopColor: 'var(--primary-color)' }}></div>;
    if (errorMsg) return <div className="card" style={{ textAlign: 'center' }}><h2>{errorMsg}</h2><Link href="/" className="btn">{isNL ? 'Terug naar menu' : 'Back to menu'}</Link></div>;

    return (
        <div className="container-narrow" style={{ paddingBottom: '50px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <Link href="/" style={{ fontWeight: '500' }}>
                    ← {isNL ? 'Terug naar overzicht' : 'Back to overview'}
                </Link>
                <button
                    onClick={toggleWakeLock}
                    className={`btn ${wakeLockEnabled ? '' : 'btn-secondary'}`}
                    style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                >
                    {wakeLockEnabled ? (isNL ? '🔥 Scherm blijft aan' : '🔥 Screen stays on') : (isNL ? '📱 Kookmodus' : '📱 Cook mode')}
                </button>
            </div>

            {/* Global Sticky Active Timers Bar */}
            {Object.keys(activeTimers).length > 0 && createPortal(
                <div style={{
                    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: 'var(--bg-card)', padding: '12px 20px', borderRadius: '30px',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.2)', border: '2px solid var(--primary-color)',
                    display: 'flex', gap: '15px', zIndex: 9000, overflowX: 'auto', maxWidth: '90vw'
                }}>
                    {Object.entries(activeTimers).map(([id, endTime]) => (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '1.2rem' }}>⏳</span>
                            {endTime <= Date.now() ? (
                                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#B34A4A', minWidth: '50px', textAlign: 'center', display: 'inline-block', animation: 'pulse 1s infinite' }}>{formatTimeRemaining(endTime)}</span>
                            ) : (
                                <span style={{ fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums', minWidth: '50px', textAlign: 'center', display: 'inline-block' }}>{formatTimeRemaining(endTime)}</span>
                            )}
                            <button
                                onClick={() => stopTimer(id)}
                                style={{ background: 'rgba(255, 90, 95, 0.1)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', cursor: 'pointer', marginLeft: '4px' }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>, document.body
            )}

            <div className="card">
                <h1 style={{ fontSize: '2rem', marginBottom: '2px' }}>{recipe.title}</h1>
                {recipe.tags && recipe.tags.split(',').length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                        {recipe.tags.split(',').map((tag: string, i: number) => (
                            <span key={i} style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--secondary-color)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '500' }}>
                                #{tag.trim()}
                            </span>
                        ))}
                    </div>
                )}
                {recipe.originalUrl && (
                    <p style={{ color: 'var(--text-light)', marginBottom: '20px' }}>
                        <a href={recipe.originalUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{isNL ? 'Originele Bron' : 'Original Source'}</a>
                    </p>
                )}

                {allMedia.length > 0 && (
                    <div style={{ marginBottom: '30px', position: 'relative' }}>
                        <div style={{ borderRadius: 'var(--border-radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', position: 'relative', cursor: 'pointer' }} >
                            {allMedia.map((src, idx) => {
                                const isActive = idx === currentCarouselIndex;
                                const isVid = src.includes('/api/v/') || src.match(/\.(mp4|mov|webm)$/i);
                                return (
                                    <div key={idx} style={{ display: isActive ? 'block' : 'none', position: 'relative' }}>
                                        {isVid ? (
                                            <>
                                                <video
                                                    ref={(el) => { videoRefs.current[idx] = el; }}
                                                    src={src}
                                                    controls
                                                    playsInline
                                                    preload="auto"
                                                    onTimeUpdate={(e) => handleTimeUpdate(idx, e.currentTarget.currentTime)}
                                                    onPlay={() => handlePlay(idx)}
                                                    onLoadedMetadata={(e) => {
                                                        if (videoTimes.current[idx]) {
                                                            e.currentTarget.currentTime = videoTimes.current[idx];
                                                        }
                                                    }}
                                                    style={{ width: '100%', maxHeight: '500px', backgroundColor: '#000', display: 'block' }}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const v = videoRefs.current[idx];
                                                        if (v) {
                                                            if (v.requestFullscreen) {
                                                                v.requestFullscreen().catch(() => { });
                                                            } else if ((v as any).webkitEnterFullscreen) {
                                                                (v as any).webkitEnterFullscreen();
                                                            }
                                                        }
                                                    }}
                                                    style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <img
                                                    src={src}
                                                    style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', backgroundColor: '#f0f0f0', display: 'block', cursor: 'pointer' }}
                                                    onClick={() => setViewerIndex(idx)}
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setViewerIndex(idx);
                                                    }}
                                                    style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                );
                            })}

                            {allMedia.length > 1 && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); setCurrentCarouselIndex((currentCarouselIndex - 1 + allMedia.length) % allMedia.length); }} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', color: '#333', fontSize: '1.5rem', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '3px' }}>‹</button>
                                    <button onClick={(e) => { e.stopPropagation(); setCurrentCarouselIndex((currentCarouselIndex + 1) % allMedia.length); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', color: '#333', fontSize: '1.5rem', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '3px' }}>›</button>
                                </>
                            )}
                        </div>

                        {allMedia.length > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '15px' }}>
                                {allMedia.map((_: string, idx: number) => (
                                    <div key={idx} onClick={() => setCurrentCarouselIndex(idx)} style={{ width: '10px', height: '10px', borderRadius: '50%', cursor: 'pointer', backgroundColor: idx === currentCarouselIndex ? 'var(--primary-color)' : '#d1d5db', transition: 'background-color 0.2s' }} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Portie Regelaar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', marginBottom: '30px' }}>
                    <strong>{isNL ? 'Voor hoeveel personen?' : 'How many servings?'}</strong>
                    <button className="btn btn-secondary" onClick={() => setTargetPortions(Math.max(1, targetPortions - 1))} style={{ padding: '8px 12px' }}>-</button>
                    <span style={{ fontSize: '1.2rem', fontWeight: '600', minWidth: '30px', textAlign: 'center' }}>{targetPortions}</span>
                    <button className="btn btn-secondary" onClick={() => setTargetPortions(targetPortions + 1)} style={{ padding: '8px 12px' }}>+</button>
                </div>

                {/* Ingrediënten */}
                <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{t('ingredients')}</h2>
                <ul style={{ listStyle: 'none', marginBottom: '40px' }}>
                    {recipe.ingredients?.map((ing: any, idx: number) => {
                        const checked = !!checkedItems[idx];
                        return (
                            <li
                                key={idx}
                                onClick={() => toggleCheck(idx)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 10px',
                                    borderBottom: '1px solid #F0E8DD', cursor: 'pointer', transition: 'var(--transition)',
                                    backgroundColor: checked ? '#F9FBF9' : 'transparent',
                                    color: checked ? 'var(--text-light)' : 'var(--text-primary)'
                                }}
                            >
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '4px',
                                    border: `2px solid ${checked ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                    backgroundColor: checked ? 'var(--primary-color)' : 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {checked && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                                </div>
                                <span style={{ fontSize: '1.1rem', textDecoration: checked ? 'line-through' : 'none' }}>
                                    <strong>{scaleAmount(ing.amount, recipe.portions || 4)} {ing.unit}</strong> {ing.name}
                                </span>
                            </li>
                        );
                    })}
                </ul>

                {/* Stappen */}
                <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{isNL ? 'Bereidingswijze' : 'Preparation'}</h2>
                <ol style={{ paddingLeft: '20px', fontSize: '1.1rem', marginBottom: '40px', color: 'var(--text-secondary)' }}>
                    {recipe.steps?.map((step: any, idx: number) => {
                        const checked = !!checkedSteps[idx];

                        // Smart Timer Detection (e.g. "15 minuten", "1 uur en 10 minuten", "fifteen minutes" -> renders a button)
                        const renderStepText = (text: string) => {
                            const splitRegex = buildTimerRegex();

                            if (!text.match(splitRegex)) return text;

                            const parts = text.split(splitRegex);
                            return (
                                <>
                                    {parts.map((part, i) => {
                                        // Check if this part is actually a timer match
                                        const timerRegex = buildTimerRegex();
                                        if (!part.match(timerRegex)) return <span key={i}>{part}</span>;

                                        const fullMatchText = part;
                                        const ms = parseTimeToMs(part);
                                        if (ms <= 0) return <span key={i}>{part}</span>;

                                        const timerId = `${idx}-${i}-${fullMatchText}`;

                                        return activeTimers[timerId] ? (
                                            <span
                                                key={i}
                                                style={{
                                                    display: 'inline-block', backgroundColor: '#FFEBEB', border: '1px solid var(--primary-color)',
                                                    color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '8px', margin: '0 4px', fontSize: '0.95em', fontWeight: 'bold'
                                                }}
                                            >
                                                ⏳ {activeTimers[timerId] <= Date.now() ? (
                                                    <span style={{ fontWeight: 'bold', color: '#B34A4A', minWidth: '40px', textAlign: 'center', display: 'inline-block', animation: 'pulse 1s infinite' }}>{formatTimeRemaining(activeTimers[timerId])}</span>
                                                ) : (
                                                    <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '40px', textAlign: 'center', display: 'inline-block' }}>{formatTimeRemaining(activeTimers[timerId])}</span>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); stopTimer(timerId); }}
                                                    style={{ background: 'none', border: 'none', marginLeft: '6px', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }}
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ) : (
                                            <button
                                                key={i}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startTimer(timerId, ms);
                                                }}
                                                style={{
                                                    background: 'var(--bg-secondary)', border: '1px solid var(--secondary-color)',
                                                    color: 'var(--text-primary)', padding: '2px 8px', borderRadius: '8px',
                                                    cursor: 'pointer', margin: '0 4px', fontSize: '0.95em', fontWeight: '600',
                                                    transition: 'var(--transition)'
                                                }}
                                            >
                                                ⏱️ {fullMatchText}
                                            </button>
                                        );
                                    })}
                                </>
                            );
                        };

                        return (
                            <li
                                key={idx}
                                onClick={() => toggleCheckStep(idx)}
                                style={{
                                    marginBottom: '16px', lineHeight: '1.7',
                                    cursor: 'pointer',
                                    transition: 'var(--transition)',
                                    opacity: checked ? 0.5 : 1,
                                    textDecoration: checked ? 'line-through' : 'none'
                                }}
                            >
                                <span style={{ color: checked ? 'var(--text-light)' : 'var(--text-primary)' }}>
                                    {renderStepText(step.description)}
                                </span>
                            </li>
                        );
                    })}
                </ol>

                {/* Publieke Voetnoot */}
                <div style={{ marginTop: '30px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
                        {isNL ? 'Gedeeld via' : 'Shared via'} <strong>{process.env.NEXT_PUBLIC_APP_NAME || 'ReteraRecepten'}</strong>
                    </p>
                </div>
            </div>

            {/* Photo Viewer Fullscreen Lightbox (For images only natively, since videos natively maximize via their button) */}
            {viewerIndex !== null && allMedia.length > 0 && createPortal(
                <div style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setViewerIndex(null)}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setViewerIndex(null);
                        }}
                        style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', zIndex: 10001, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1' }}
                    >✕</button>

                    {allMedia.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewerIndex((viewerIndex - 1 + allMedia.length) % allMedia.length); }}
                            style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '5px' }}
                        >‹</button>
                    )}

                    {(() => {
                        const mSrc = allMedia[viewerIndex];
                        if (!mSrc) return null;
                        return <img src={mSrc} alt="Fullscreen view" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90%', maxHeight: '85vh', objectFit: 'contain' }} />;
                    })()}

                    {allMedia.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewerIndex((viewerIndex + 1) % allMedia.length); }}
                            style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '5px' }}
                        >›</button>
                    )}

                    {allMedia.length > 1 && (
                        <div style={{ position: 'absolute', bottom: '30px', color: 'white', fontSize: '1.1rem', backgroundColor: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px' }}>
                            {viewerIndex + 1} / {allMedia.length}
                        </div>
                    )}
                </div>, document.body
            )}
        </div>
    );
}
