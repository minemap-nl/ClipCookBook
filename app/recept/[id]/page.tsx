'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

const FilmstripScrubber = ({ videoRef, onCapture, onCancel }: { videoRef: React.RefObject<HTMLVideoElement | null>, onCapture: () => void, onCancel: () => void }) => {
    const [frames, setFrames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Drag to scroll state
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const generateFrames = async () => {
            if (!videoRef.current) return;
            const videoSrc = videoRef.current.currentSrc || videoRef.current.src;
            if (!videoSrc) return;

            const video = document.createElement('video');
            video.src = videoSrc;
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.playsInline = true;

            await new Promise((resolve) => {
                video.addEventListener('loadeddata', resolve, { once: true });
            });

            const duration = video.duration;
            if (!duration || !isFinite(duration)) {
                if (isMounted) setLoading(false);
                return;
            }

            const frameCount = 15;
            const newFrames: string[] = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = 80;
            canvas.height = (video.videoHeight / video.videoWidth) * 80;

            for (let i = 0; i < frameCount; i++) {
                video.currentTime = (duration / frameCount) * i;
                await new Promise((resolve) => {
                    video.addEventListener('seeked', resolve, { once: true });
                });
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    newFrames.push(canvas.toDataURL('image/jpeg', 0.5));
                }
            }
            if (isMounted) {
                setFrames(newFrames);
                setLoading(false);
            }
        };

        generateFrames();
        return () => { isMounted = false; };
    }, [videoRef]);

    const handleScroll = () => {
        if (!scrollRef.current || !videoRef.current) return;
        const container = scrollRef.current;
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll <= 0) return;

        const percentage = container.scrollLeft / maxScroll;
        const clampedPct = Math.max(0, Math.min(1, percentage));
        videoRef.current.currentTime = clampedPct * videoRef.current.duration;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeft(scrollRef.current.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX) * 1.5; // Scroll speed multiplier
        scrollRef.current.scrollLeft = scrollLeft - walk;
    };

    return (
        <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#F9FBF9', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <p style={{ marginBottom: '15px', color: 'var(--text-primary)', fontWeight: '500', fontSize: '0.95rem' }}>
                Sleep de tijdlijn heen en weer (horizontaal) langs de stippellijn om het perfecte frame te selecteren.
            </p>

            {loading ? (
                <div style={{ padding: '30px', color: 'var(--text-secondary)' }}>Omslagfoto's genereren voor tijdlijn... ⏳</div>
            ) : (
                <div style={{ position: 'relative', marginBottom: '20px', backgroundColor: '#000', borderRadius: '6px', overflow: 'hidden' }}>
                    {/* Witte marker in het midden */}
                    <div style={{
                        position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px',
                        backgroundColor: '#fff', zIndex: 10, transform: 'translateX(-50%)',
                        boxShadow: '0 0 4px rgba(0,0,0,0.5)', pointerEvents: 'none'
                    }} />

                    {/* Scrollable Container */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeave}
                        onMouseUp={handleMouseUp}
                        onMouseMove={handleMouseMove}
                        style={{
                            display: 'flex', overflowX: 'auto', scrollSnapType: 'none',
                            padding: '0 50%',
                            scrollbarWidth: 'none', // hide scrollbar Firefox
                            msOverflowStyle: 'none', // hide scrollbar IE
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none'
                        }}
                    >
                        <style>{`
                            div::-webkit-scrollbar { display: none; }
                        `}</style>
                        {frames.map((src, i) => (
                            <img
                                key={i}
                                src={src}
                                alt="frame"
                                draggable={false} // Prevent default browser image drag
                                style={{ height: '60px', width: 'auto', flexShrink: 0, objectFit: 'cover', opacity: 0.8, pointerEvents: 'none' }}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={onCapture} className="btn" style={{ flex: '1 1 auto', minWidth: '120px' }}>Vastleggen als Omslagfoto</button>
                <button onClick={onCancel} className="btn btn-secondary" style={{ flex: '1 1 auto', minWidth: '120px' }}>Annuleren</button>
            </div>
        </div>
    );
};

export default function ReceptDetail() {
    const { id } = useParams();
    const router = useRouter();

    const [recipe, setRecipe] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [targetPortions, setTargetPortions] = useState(4);
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
    const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
    const [wakeLockSentinel, setWakeLockSentinel] = useState<any>(null);

    // Active timers map: string (id) -> endDate (number, epoch ms)
    const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
    // Local state to trigger re-renders for the countdown
    const [, setTick] = useState(0);

    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPortions, setEditPortions] = useState(4);

    // Thumbnail Editor State
    const [editThumbnail, setEditThumbnail] = useState<string | null>(null);
    const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
    const [scrubbing, setScrubbing] = useState(false);
    const [choosingVideo, setChoosingVideo] = useState(false);
    const [scrubbingVideoUrl, setScrubbingVideoUrl] = useState<string | null>(null);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Photo & Media Viewer State
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

    // Verzamel media voor de slider (ZONDER de losse omslagfoto)
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

    // Editing Media State
    const [editMedia, setEditMedia] = useState<string[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [dragOverMediaIdx, setDragOverMediaIdx] = useState<number | null>(null);
    const [dragMediaPosition, setDragMediaPosition] = useState<'left' | 'right' | null>(null);

    // Tag Manager State
    const [editTags, setEditTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    const [editIngredients, setEditIngredients] = useState<any[]>([]);
    const [editSteps, setEditSteps] = useState<any[]>([]);

    const [emailOpen, setEmailOpen] = useState(false);
    const [emailAddress, setEmailAddress] = useState('');
    const [emailStatus, setEmailStatus] = useState('');

    // In-app modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [modalType, setModalType] = useState<'confirm' | 'info'>('info');
    const [modalCallback, setModalCallback] = useState<(() => void) | null>(null);
    const [toast, setToast] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
    const showConfirm = (msg: string, onConfirm: () => void) => {
        setModalMessage(msg); setModalType('confirm'); setModalCallback(() => onConfirm); setModalOpen(true);
    };

    useEffect(() => {
        fetch(`/api/recept/${id}`, { credentials: 'include' })
            .then(r => { if (r.status === 401) { window.location.reload(); return; } if (!r.ok) throw new Error("Niet gevonden"); return r.json(); })
            .then(data => { setRecipe(data); setTargetPortions(data.portions || 4); setLoading(false); })
            .catch(e => { setErrorMsg(e.message); setLoading(false); });
    }, [id]);

    const toggleCheck = (idx: number) => {
        setCheckedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleCheckStep = (idx: number) => {
        setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleWakeLock = async () => {
        if (!('wakeLock' in navigator)) {
            alert('Je browser ondersteunt Kookmodus (Wake Lock) niet.');
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
            alert('Kon kookmodus niet activeren.');
        }
    };

    const startEditing = () => {
        setEditTitle(recipe.title);
        setEditDescription(recipe.description || '');
        setEditPortions(recipe.portions || 4);
        setEditTags(recipe.tags ? recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t !== '') : []);
        setEditIngredients(recipe.ingredients?.map((i: any) => ({ name: i.name, amount: i.amount, unit: i.unit || '' })) || []);
        setEditSteps(recipe.steps?.map((s: any) => ({ description: s.description })) || []);
        setEditMedia([...allMedia]); // Copy the current unified media correctly into the editor state
        setEditThumbnail(recipe.thumbnailPath || recipe.originalThumbnail || null); // Initialize standalone thumbnail
        setEditing(true);
    };

    const captureThumbnail = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                // Assign the captured frame directly to the thumbnail path
                setEditThumbnail(dataUrl);
                setScrubbing(false);
            }
        }
    };

    const cancelEditing = () => {
        setEditing(false);
        setScrubbing(false);
        setChoosingVideo(false);
        setScrubbingVideoUrl(null);
    };

    const saveEditing = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/recept/${id}`, {
                credentials: 'include',
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editTitle,
                    description: editDescription,
                    portions: editPortions,
                    tags: editTags.join(','),
                    ingredients: editIngredients,
                    steps: editSteps,
                    editMedia: editMedia,
                    thumbnailPath: editThumbnail,
                })
            });
            if (!res.ok) throw new Error("Opslaan mislukt");
            const updated = await res.json();
            setRecipe(updated);
            setTargetPortions(updated.portions || 4);
            setEditing(false);
            showToast("Recept opgeslagen!");
        } catch {
            showToast("Fout bij opslaan");
        }
        setSaving(false);
    };

    // Tag Handlers
    const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.trim().toLowerCase();
            if (val && !editTags.includes(val)) {
                setEditTags([...editTags, val]);
            }
            setTagInput('');
        }
    };
    const removeTag = (tagToRemove: string) => {
        setEditTags(editTags.filter(t => t !== tagToRemove));
    };

    const scaleAmount = (amount: number | null, startPortions: number) => {
        if (amount === null) return '';
        if (startPortions === 0) return amount;
        const scaled = (amount / startPortions) * targetPortions;
        return Number.isInteger(scaled) ? scaled : scaled.toFixed(1).replace('.', ',');
    };

    const handleDelete = () => {
        showConfirm("Weet je zeker dat je dit recept wil verwijderen?", async () => {
            try { await fetch(`/api/recept/${id}`, { method: 'DELETE', credentials: 'include' }); router.push('/'); }
            catch { showToast("Kan niet verwijderen"); }
        });
    };

    const sendEmail = async (e: React.FormEvent) => {
        e.preventDefault(); setEmailStatus('Verzenden...');
        try {
            const res = await fetch('/api/email', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipeId: id, targetEmail: emailAddress }) });
            if (res.ok) { setEmailStatus('Verstuurd!'); setTimeout(() => setEmailOpen(false), 2000); }
            else { const err = await res.json(); setEmailStatus('Fout: ' + (err.error || 'Onbekend')); }
        } catch { setEmailStatus('Netwerkfout'); }
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
        if (remainingStr <= 0) return 'Klaar!';

        const totalSeconds = Math.floor(remainingStr / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Edit helpers
    const updateIngredient = (idx: number, field: string, value: any) => {
        setEditIngredients(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    };
    const removeIngredient = (idx: number) => setEditIngredients(prev => prev.filter((_, i) => i !== idx));
    const addIngredient = () => setEditIngredients(prev => [...prev, { name: '', amount: null, unit: '' }]);
    const moveIngredient = (idx: number, dir: -1 | 1) => {
        setEditIngredients(prev => {
            const arr = [...prev]; const target = idx + dir;
            if (target < 0 || target >= arr.length) return arr;
            [arr[idx], arr[target]] = [arr[target], arr[idx]];
            return arr;
        });
    };

    const updateStep = (idx: number, value: string) => {
        setEditSteps(prev => prev.map((item, i) => i === idx ? { description: value } : item));
    };
    const removeStep = (idx: number) => setEditSteps(prev => prev.filter((_, i) => i !== idx));
    const addStep = () => setEditSteps(prev => [...prev, { description: '' }]);
    const moveStep = (idx: number, dir: -1 | 1) => {
        setEditSteps(prev => {
            const arr = [...prev]; const target = idx + dir;
            if (target < 0 || target >= arr.length) return arr;
            [arr[idx], arr[target]] = [arr[target], arr[idx]];
            return arr;
        });
    };

    if (loading) return <div className="spinner" style={{ margin: '50px auto', borderTopColor: 'var(--primary-color)' }}></div>;
    if (errorMsg) return <div className="card" style={{ textAlign: 'center' }}><h2>{errorMsg}</h2><Link href="/" className="btn">Terug</Link></div>;

    const inputStyle = { padding: '8px 10px', fontSize: '0.95rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%' };
    const smallInputStyle = { ...inputStyle, width: '70px', textAlign: 'center' as const };

    return (
        <>
            <div className="container-narrow" style={{ paddingBottom: '50px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <Link href="/" style={{ fontWeight: '500' }}>
                        ← Terug naar overzicht
                    </Link>
                    <button
                        onClick={toggleWakeLock}
                        className={`btn ${wakeLockEnabled ? '' : 'btn-secondary'}`}
                        style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                    >
                        {wakeLockEnabled ? '🔥 Scherm blijft aan' : '📱 Kookmodus'}
                    </button>
                </div>

                {toast && <div className="toast">{toast}</div>}

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
                    {/* Titel & Beschrijving */}
                    {editing ? (
                        <>
                            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...inputStyle, fontSize: '1.6rem', fontWeight: '600', marginBottom: '10px' }} />
                            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Korte beschrijving..." style={{ ...inputStyle, marginBottom: '10px', resize: 'vertical' }} />

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Tags (Druk op Enter)</label>
                                <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px' }}>
                                    {editTags.map(t => (
                                        <span key={t} style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            #{t}
                                            <button type="button" onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: '1' }}>✕</button>
                                        </span>
                                    ))}
                                    <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Typ tag..." style={{ border: 'none', outline: 'none', flex: 1, minWidth: '100px', padding: '4px' }} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
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
                            {recipe.description && <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.6' }}>{recipe.description}</p>}
                        </>
                    )}

                    {recipe.originalUrl && (
                        <p style={{ color: 'var(--text-light)', marginBottom: '20px' }}>
                            <a href={recipe.originalUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Originele Bron</a>
                        </p>
                    )}

                    {/* --- OMSLAGFOTO EDITOR --- */}
                    {editing && (
                        <div style={{ marginTop: '15px', marginBottom: '30px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius)' }}>
                            <h3 style={{ marginBottom: '10px', fontSize: '1.1rem' }}>Omslagfoto (Hoofdafbeelding)</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                                Kies de foto die wordt getoond op de startpagina. Je kan een afbeelding uploaden of uit je media selecteren.
                            </p>

                            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                {/* Geselecteerde preview */}
                                <div style={{ width: '120px', height: '120px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e0e0e0', flexShrink: 0, position: 'relative' }}>
                                    {editThumbnail ? (
                                        <img src={editThumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>Geen Omslagfoto</div>
                                    )}
                                </div>

                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Upload Button */}
                                    <label className="btn" style={{ cursor: 'pointer', textAlign: 'center', padding: '8px', fontSize: '0.9rem', backgroundColor: 'var(--primary-color)' }}>
                                        {uploadingThumbnail ? 'Uploaden...' : 'Upload Nieuwe Omslagfoto'}
                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                            if (!e.target.files || e.target.files.length === 0) return;
                                            setUploadingThumbnail(true);
                                            const formData = new FormData();
                                            formData.append('file', e.target.files[0]);
                                            try {
                                                const r = await fetch('/api/upload/media', { method: 'POST', body: formData });
                                                if (r.ok) {
                                                    const res = await r.json();
                                                    if (res.success && res.urls.length > 0) setEditThumbnail(res.urls[0]);
                                                }
                                            } finally { setUploadingThumbnail(false); }
                                        }} />
                                    </label>

                                    {/* Kies uit Media */}
                                    {editMedia.filter(u => u.includes('/api/thumbnail/') || u.match(/\.(jpeg|jpg|png|gif|webp)$/i) || u.startsWith('data:image')).length > 0 && (
                                        <div style={{ marginTop: '5px' }}>
                                            <div style={{ fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Kies uit mediagalerij:</div>
                                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                                                {editMedia.filter(u => u.includes('/api/thumbnail/') || u.match(/\.(jpeg|jpg|png|gif|webp)$/i) || u.startsWith('data:image')).map((url, idx) => (
                                                    <img key={idx} src={url} onClick={() => setEditThumbnail(url)} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: editThumbnail === url ? '2px solid var(--primary-color)' : '1px solid var(--border-color)' }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Extract from video button */}
                            {editMedia.some(u => u.includes('/api/video/') || u.match(/\.(mp4|mov|webm)$/i)) && (
                                <button onClick={() => {
                                    const vids = editMedia.filter(u => u.includes('/api/video/') || u.match(/\.(mp4|mov|webm)$/i));
                                    if (vids.length === 1) {
                                        setScrubbingVideoUrl(vids[0]);
                                        setScrubbing(true);
                                    } else if (vids.length > 1) {
                                        setChoosingVideo(true);
                                    }
                                }} style={{ marginTop: '15px', width: '100%', padding: '10px', backgroundColor: '#ffffff', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', fontWeight: '500', cursor: 'pointer' }}>
                                    Extraheer foto uit de video als Omslagfoto
                                </button>
                            )}

                            {choosingVideo && (
                                <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.9rem', marginBottom: '10px', fontWeight: 'bold' }}>Kies de video waaruit je de cover foto wilt halen:</div>
                                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                                        {editMedia.filter(u => u.includes('/api/video/') || u.match(/\.(mp4|mov|webm)$/i)).map((vUrl, idx) => (
                                            <video key={idx} src={vUrl} onClick={() => {
                                                setScrubbingVideoUrl(vUrl);
                                                setChoosingVideo(false);
                                                setScrubbing(true);
                                            }} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border-color)' }} muted preload="metadata" />
                                        ))}
                                    </div>
                                    <button onClick={() => setChoosingVideo(false)} className="btn btn-secondary" style={{ marginTop: '10px', padding: '5px 10px', fontSize: '0.8rem' }}>Annuleren</button>
                                </div>
                            )}

                            {scrubbing && scrubbingVideoUrl && (
                                <div style={{ marginTop: '15px' }}>
                                    <FilmstripScrubber videoRef={videoRef} onCapture={captureThumbnail} onCancel={() => { setScrubbing(false); setScrubbingVideoUrl(null); }} />
                                </div>
                            )}
                            <video ref={videoRef} src={scrubbingVideoUrl || undefined} style={{ display: 'none' }} crossOrigin="anonymous" preload="auto" />
                        </div>
                    )}

                    {/* --- UNIFIED MEDIA VIEWER EN EDITOR --- */}
                    {editing ? (
                        <div style={{ marginTop: '15px', marginBottom: '30px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius)' }}>
                            <h3 style={{ marginBottom: '10px', fontSize: '1.1rem' }}>Recept Media (Foto's & Video's)</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                                Beheer hier alle foto's en video's specifiek in dit recept.
                            </p>

                            {uploadingMedia && <div style={{ marginBottom: '10px', color: 'var(--primary-color)' }}>Media uploaden...</div>}

                            <div
                                style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}
                                onDragLeave={(e) => {
                                    // Make sure we actually left the container, not just moved into a child
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        setDragOverMediaIdx(null);
                                        setDragMediaPosition(null);
                                    }
                                }}
                                onDrop={() => {
                                    setDragOverMediaIdx(null);
                                    setDragMediaPosition(null);
                                }}
                            >
                                {/* Upload Button */}
                                <label style={{ flexShrink: 0, width: '100px', cursor: 'pointer', border: '2px dashed var(--border-color)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' }}>
                                    <span style={{ fontSize: '1.5rem', marginBottom: '5px' }}>+</span>
                                    <span style={{ fontSize: '0.7rem', textAlign: 'center' }}>Toevoegen</span>
                                    <input type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={async (e) => {
                                        if (!e.target.files || e.target.files.length === 0) return;
                                        setUploadingMedia(true);
                                        const formData = new FormData();
                                        Array.from(e.target.files).forEach(f => formData.append('file', f));
                                        try {
                                            const r = await fetch('/api/upload/media', { method: 'POST', body: formData });
                                            if (r.ok) {
                                                const res = await r.json();
                                                if (res.success) setEditMedia(prev => [...prev, ...res.urls]);
                                            }
                                        } finally {
                                            setUploadingMedia(false);
                                        }
                                    }} />
                                </label>

                                {/* Media Items */}
                                {editMedia.map((url, idx) => {
                                    const isVid = url.includes('/api/video/') || url.match(/\.(mp4|mov|webm)$/i) || url.startsWith('data:video');
                                    return (
                                        <div
                                            key={idx}
                                            draggable
                                            onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = 'move';
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX - rect.left;
                                                const position = x < rect.width / 2 ? 'left' : 'right';

                                                if (dragOverMediaIdx !== idx || dragMediaPosition !== position) {
                                                    setDragOverMediaIdx(idx);
                                                    setDragMediaPosition(position);
                                                }
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();

                                                const fromIdxStr = e.dataTransfer.getData('text/plain');
                                                if (!fromIdxStr) return;
                                                const fromIdx = parseInt(fromIdxStr, 10);

                                                const finalPosition = dragMediaPosition;
                                                setDragOverMediaIdx(null);
                                                setDragMediaPosition(null);

                                                if (fromIdx === idx) return;

                                                setEditMedia(prev => {
                                                    const arr = [...prev];
                                                    const item = arr.splice(fromIdx, 1)[0];

                                                    let targetIdx = idx;
                                                    // Because an item before it was removed, the target index shifts left
                                                    if (fromIdx < idx) targetIdx -= 1;
                                                    // If dropping on the right side, it goes after the target
                                                    if (finalPosition === 'right') targetIdx += 1;

                                                    arr.splice(targetIdx, 0, item);
                                                    return arr;
                                                });
                                            }}
                                            style={{
                                                flexShrink: 0, width: '100px', cursor: 'grab', position: 'relative',
                                                borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)',
                                                boxShadow: dragOverMediaIdx === idx && dragMediaPosition === 'left' ? 'inset 4px 0 0 var(--primary-color)'
                                                    : dragOverMediaIdx === idx && dragMediaPosition === 'right' ? 'inset -4px 0 0 var(--primary-color)'
                                                        : 'none',
                                                transition: 'box-shadow 0.2s ease',
                                                backgroundColor: '#fff'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#eee', padding: '2px', fontSize: '0.65rem' }}>
                                                <button onClick={() => {
                                                    if (idx > 0) setEditMedia(prev => { const n = [...prev];[n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
                                                }} disabled={idx === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px', color: idx === 0 ? '#ccc' : '#000' }}>‹</button>
                                                <span>{idx + 1}</span>
                                                <button onClick={() => {
                                                    if (idx < editMedia.length - 1) setEditMedia(prev => { const n = [...prev];[n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n; });
                                                }} disabled={idx === editMedia.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px', color: idx === editMedia.length - 1 ? '#ccc' : '#000' }}>›</button>
                                            </div>
                                            {isVid ? (
                                                <video src={url} style={{ width: '100%', height: '60px', objectFit: 'cover' }} muted preload="metadata" />
                                            ) : (
                                                <img src={url} style={{ width: '100%', height: '60px', objectFit: 'cover' }} />
                                            )}
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                showConfirm("Weet je zeker dat je deze media wilt verwijderen?", () => {
                                                    setEditMedia(prev => prev.filter((_, i) => i !== idx));
                                                });
                                            }} style={{ position: 'absolute', top: '25px', right: '5px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                        </div>
                                    )
                                })}
                            </div>

                        </div>
                    ) : (
                        allMedia.length > 0 && (
                            <div style={{ marginBottom: '30px', position: 'relative' }}>
                                <div style={{ borderRadius: 'var(--border-radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
                                    {allMedia.map((src, idx) => {
                                        const isActive = idx === currentCarouselIndex;
                                        const isVid = src.includes('/api/video/') || src.match(/\.(mp4|mov|webm)$/i);
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
                        )
                    )}

                    {/* Porties */}
                    {editing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', marginBottom: '30px' }}>
                            <strong>Porties:</strong>
                            <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setEditPortions(Math.max(1, editPortions - 1))}>-</button>
                            <span style={{ fontSize: '1.2rem', fontWeight: '600', minWidth: '30px', textAlign: 'center' }}>{editPortions}</span>
                            <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setEditPortions(editPortions + 1)}>+</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', marginBottom: '30px' }}>
                            <strong>Voor hoeveel personen?</strong>
                            <button className="btn btn-secondary" onClick={() => setTargetPortions(Math.max(1, targetPortions - 1))} style={{ padding: '8px 12px' }}>-</button>
                            <span style={{ fontSize: '1.2rem', fontWeight: '600', minWidth: '30px', textAlign: 'center' }}>{targetPortions}</span>
                            <button className="btn btn-secondary" onClick={() => setTargetPortions(targetPortions + 1)} style={{ padding: '8px 12px' }}>+</button>
                        </div>
                    )}

                    {/* Ingrediënten */}
                    <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Benodigdheden</h2>
                    {editing ? (
                        <div style={{ marginBottom: '30px' }}>
                            {editIngredients.map((ing, idx) => (
                                <div
                                    key={idx}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                        if (fromIdx === idx) return;
                                        setEditIngredients(prev => {
                                            const arr = [...prev];
                                            const item = arr.splice(fromIdx, 1)[0];
                                            arr.splice(idx, 0, item);
                                            return arr;
                                        });
                                    }}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', cursor: 'grab' }}
                                >
                                    <div style={{ color: 'var(--text-light)', padding: '0 8px', fontSize: '1.2rem', cursor: 'grab' }} title="Sleep om te verplaatsen">
                                        ⋮⋮
                                    </div>
                                    <input type="number" value={ing.amount ?? ''} onChange={e => updateIngredient(idx, 'amount', e.target.value)} placeholder="#" style={smallInputStyle} />
                                    <input value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)} placeholder="Eenheid" style={{ ...inputStyle, width: '80px' }} />
                                    <input value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} placeholder="Ingrediënt" style={{ ...inputStyle, flex: 1 }} />
                                    <button onClick={() => removeIngredient(idx)} style={{ background: 'none', border: 'none', color: '#D47B7B', fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                                </div>
                            ))}
                            <button className="btn btn-secondary" style={{ marginTop: '8px', padding: '8px 16px', fontSize: '0.85rem' }} onClick={addIngredient}>
                                + Ingrediënt toevoegen
                            </button>
                        </div>
                    ) : (
                        <ul style={{ listStyle: 'none', marginBottom: '40px' }}>
                            {recipe.ingredients?.map((ing: any, idx: number) => {
                                const checked = !!checkedItems[idx];
                                return (
                                    <li key={idx} onClick={() => toggleCheck(idx)} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 10px',
                                        borderBottom: '1px solid #F0E8DD', cursor: 'pointer', transition: 'var(--transition)',
                                        backgroundColor: checked ? '#F9FBF9' : 'transparent', color: checked ? 'var(--text-light)' : 'var(--text-primary)'
                                    }}>
                                        <div style={{
                                            width: '24px', height: '24px', borderRadius: '4px',
                                            border: `2px solid ${checked ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                            backgroundColor: checked ? 'var(--primary-color)' : 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            {checked && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                                        </div>
                                        <span style={{ fontSize: '1.05rem', textDecoration: checked ? 'line-through' : 'none' }}>
                                            <strong>{scaleAmount(ing.amount, recipe.portions || 4)} {ing.unit}</strong> {ing.name}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* Stappen */}
                    <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Bereidingswijze</h2>
                    {editing ? (
                        <div style={{ marginBottom: '30px' }}>
                            {editSteps.map((step, idx) => (
                                <div
                                    key={idx}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                        if (fromIdx === idx) return;
                                        setEditSteps(prev => {
                                            const arr = [...prev];
                                            const item = arr.splice(fromIdx, 1)[0];
                                            arr.splice(idx, 0, item);
                                            return arr;
                                        });
                                    }}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '8px', cursor: 'grab' }}
                                >
                                    <div style={{ color: 'var(--text-light)', padding: '10px 8px 0', fontSize: '1.2rem', cursor: 'grab' }} title="Sleep om te verplaatsen">
                                        ⋮⋮
                                    </div>
                                    <span style={{ color: 'var(--text-light)', fontWeight: '600', minWidth: '25px', paddingTop: '10px' }}>{idx + 1}.</span>
                                    <textarea value={step.description} onChange={e => updateStep(idx, e.target.value)}
                                        style={{ ...inputStyle, flex: 1, minHeight: '60px', resize: 'vertical' }} />
                                    <button onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', color: '#D47B7B', fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px', marginTop: '8px' }}>✕</button>
                                </div>
                            ))}
                            <button className="btn btn-secondary" style={{ marginTop: '8px', padding: '8px 16px', fontSize: '0.85rem' }} onClick={addStep}>
                                + Stap toevoegen
                            </button>
                        </div>
                    ) : (
                        <ol style={{ paddingLeft: '20px', fontSize: '1.05rem', marginBottom: '40px', color: 'var(--text-secondary)' }}>
                            {recipe.steps?.map((step: any, idx: number) => {
                                const checked = !!checkedSteps[idx];

                                const renderStepText = (text: string) => {
                                    // Match numbers with possible decimals, followed by a time unit.
                                    // The global flag (/g) allows matching multiple times per step.
                                    const splitRegex = /((?:\d+(?:[.,]\d+)?)\s*(?:minuten|minutes|minuut|mins|min\b|seconden|secondes|second|sec\b|uren|hours|uur|hrs\b|dagen|days|dag\b))/gi;

                                    if (!text.match(splitRegex)) return text;

                                    const parts = text.split(splitRegex);
                                    return (
                                        <>
                                            {parts.map((part, i) => {
                                                // Even indices are normal text, odd indices are the matched time strings
                                                if (i % 2 === 0) return <span key={i}>{part}</span>;

                                                const fullMatchText = part;
                                                const lowerPart = part.toLowerCase();
                                                const numMatch = part.match(/(\d+(?:[.,]\d+)?)/);
                                                if (!numMatch) return <span key={i}>{part}</span>;

                                                const val = parseFloat(numMatch[1].replace(',', '.'));
                                                let ms = 0;
                                                if (lowerPart.includes('sec')) ms = val * 1000;
                                                else if (lowerPart.includes('min')) ms = val * 60 * 1000;
                                                else if (lowerPart.includes('uur') || lowerPart.includes('hour') || lowerPart.includes('hrs')) ms = val * 60 * 60 * 1000;
                                                else if (lowerPart.includes('dag') || lowerPart.includes('day')) ms = val * 24 * 60 * 60 * 1000;
                                                else ms = val * 60 * 1000; // fallback to minutes

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
                    )}

                    {/* Acties */}
                    <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                        {editing ? (
                            <>
                                <button className="btn" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={saveEditing} disabled={saving}>
                                    {saving ? 'Opslaan...' : 'Opslaan'}
                                </button>
                                <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={cancelEditing}>
                                    Annuleren
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="btn" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={startEditing}>
                                    Bewerken
                                </button>
                                <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={() => {
                                    const shareUrl = `${window.location.origin}/share/${id}`;
                                    if (navigator.share) {
                                        navigator.share({ title: recipe.title, url: shareUrl }).catch(() => { });
                                    } else {
                                        try {
                                            if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(shareUrl); }
                                            else {
                                                const ta = document.createElement('textarea'); ta.value = shareUrl;
                                                ta.style.position = 'fixed'; ta.style.opacity = '0';
                                                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                                            }
                                            showToast("Link gekopieerd!");
                                        } catch { showToast("Kan link niet kopiëren"); }
                                    }
                                }}>
                                    Delen
                                </button>
                                <button className="btn btn-secondary" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={() => setEmailOpen(!emailOpen)}>
                                    E-mailen
                                </button>
                                <button className="btn btn-danger" style={{ flex: 1, padding: '10px 8px', fontSize: '0.85rem' }} onClick={handleDelete}>
                                    Verwijderen
                                </button>
                            </>
                        )}
                    </div>

                    {/* Email */}
                    {emailOpen && (
                        <form onSubmit={sendEmail} style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                            <label>Naar wie wil je het sturen?</label>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} required placeholder="oma@familie.nl" style={{ flex: 1 }} />
                                <button type="submit" className="btn">Verstuur</button>
                            </div>
                            {emailStatus && <p style={{ marginTop: '10px', fontWeight: '500' }}>{emailStatus}</p>}
                        </form>
                    )}

                    {/* Modal */}
                    {modalOpen && createPortal(
                        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
                            onClick={() => setModalOpen(false)}>
                            <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', padding: '30px', maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}
                                onClick={e => e.stopPropagation()}>
                                <p style={{ fontSize: '1.1rem', marginBottom: '25px', lineHeight: '1.5' }}>{modalMessage}</p>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    {modalType === 'confirm' ? (
                                        <>
                                            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Annuleren</button>
                                            <button className="btn btn-danger" onClick={() => { setModalOpen(false); modalCallback?.(); }}>Ja, verwijder</button>
                                        </>
                                    ) : (
                                        <button className="btn" onClick={() => setModalOpen(false)}>Oké</button>
                                    )}
                                </div>
                            </div>
                        </div>, document.body
                    )}
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
        </>
    );
}
