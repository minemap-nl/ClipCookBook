'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import CoverPhotoSelector from '@/components/CoverPhotoSelector';

export default function Toevoegen() {
    const { t, isNL } = useI18n();
    const [activeTab, setActiveTab] = useState<'link' | 'photo' | 'manual'>('link');
    const [url, setUrl] = useState('');
    const [deepSearch, setDeepSearch] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorLine, setErrorLine] = useState('');
    const [aiEnabled, setAiEnabled] = useState(false);
    const router = useRouter();

    // --- Manual Form State ---
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [portions, setPortions] = useState(4);

    // Tags Manager
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    const [ingredients, setIngredients] = useState<any[]>([{ name: '', amount: null, unit: '' }]);
    const [steps, setSteps] = useState<any[]>([{ description: '' }]);
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
    const [tempCoverUrl, setTempCoverUrl] = useState<string | null>(null);

    // Queue State
    const [jobs, setJobs] = useState<any[]>([]);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const res = await fetch('/api/extract/status?limit=10');
                if (res.ok) {
                    const data = await res.json();
                    setJobs(data.jobs || []);
                }
            } catch (e) {
                console.error("Failed to fetch jobs", e);
            }
        };

        fetchJobs();
        const interval = setInterval(fetchJobs, 3000); // poll elke 3 seconden
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => setAiEnabled(data.aiEnabled))
            .catch(() => setAiEnabled(false));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sharedUrl = params.get('url') || params.get('text');
        if (sharedUrl && sharedUrl.startsWith('http')) {
            setUrl(sharedUrl);
            setActiveTab('link');
        }
    }, []);

    // --- Tab 1: Link Import ---
    async function handleImport(e: React.FormEvent) {
        e.preventDefault();
        if (!url) return;
        setLoading(true); setErrorLine('');

        try {
            const res = await fetch('/api/extract', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, deepSearch })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || (isNL ? 'Er ging iets fout bij het verwerken.' : 'Something went wrong during processing.'));

            if (!data.jobId && data.recipeId) {
                // Recipe already exists, show info message and do NOT clear URL
                setErrorLine(isNL ? `Dit recept staat al in je database! Bekijk het hier: /recept/${data.recipeId}` : `This recipe is already in your database! View it here: /recept/${data.recipeId}`);
                setLoading(false);
            } else {
                // Clear URL so user can paste the next one
                setUrl('');
                setLoading(false);
            }
            // We no longer router.push, the polling useEffect will pick up the new job automatically
        } catch (e: any) {
            setErrorLine(e.message); setLoading(false);
        }
    }

    // --- Tab 1b: Photo Import ---
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            setPhotos(prev => [...prev, ...filesArray]);

            // Create previews for the new files
            const previews = filesArray.map(f => URL.createObjectURL(f));
            setPhotoPreviews(prev => [...prev, ...previews]);

            // Reset input so re-selecting the same file works
            e.target.value = '';
        }
    };

    const handlePhotoRemove = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
        setPhotoPreviews(prev => {
            const newPreviews = prev.filter((_, i) => i !== index);
            URL.revokeObjectURL(prev[index]); // Free memory
            return newPreviews;
        });
    };

    async function handlePhotoSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (photos.length === 0) return;
        setLoading(true); setErrorLine('');

        try {
            const formData = new FormData();
            photos.forEach(photo => formData.append('photos', photo));

            const res = await fetch('/api/extract/photo', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || (isNL ? 'Er ging iets fout bij het verwerken.' : 'Something went wrong during processing.'));

            router.push(`/recept/${data.recipeId}`);
        } catch (err: any) {
            setErrorLine(err.message);
            setLoading(false);
        }
    }

    // --- Tab 2: Manual Form ---
    const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.trim().toLowerCase();
            if (val && !tags.includes(val)) {
                setTags([...tags, val]);
            }
            setTagInput('');
        }
    };
    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const addIngredient = () => setIngredients([...ingredients, { name: '', amount: null, unit: '' }]);
    const updateIngredient = (idx: number, field: string, val: string) => {
        const newArr = [...ingredients];
        newArr[idx][field] = val;
        setIngredients(newArr);
    };
    const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));

    const addStep = () => setSteps([...steps, { description: '' }]);
    const updateStep = (idx: number, val: string) => {
        const newArr = [...steps];
        newArr[idx].description = val;
        setSteps(newArr);
    };
    const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));

    async function handleManualSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) {
            setErrorLine(isNL ? 'Titel is verplicht.' : 'Title is required.');
            return;
        }

        setLoading(true); setErrorLine('');

        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('description', description.trim());
            formData.append('portions', portions.toString());
            formData.append('tags', tags.join(',')); // send tags as comma-separated string

            // Filter empty items
            const filteredIngredients = ingredients.filter(i => i.name.trim() !== '');
            const filteredSteps = steps.filter(s => s.description.trim() !== '');

            formData.append('ingredients', JSON.stringify(filteredIngredients));
            formData.append('steps', JSON.stringify(filteredSteps));

            if (coverPhoto) {
                // If the user cropped the image, coverPhoto is a data URL
                formData.append('thumbnail', coverPhoto);
            }

            mediaFiles.forEach(f => formData.append('mediaFiles', f));

            const res = await fetch('/api/recept', {
                method: 'POST',
                credentials: 'include',
                body: formData // Note: no Content-Type header needed for FormData, browser sets boundary
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || (isNL ? 'Fout bij opslaan' : 'Error saving'));
            router.push(`/recept/${data.recipeId}`);

        } catch (err: any) {
            setErrorLine(err.message);
            setLoading(false);
        }
    }
    const inputStyle = { padding: '10px', fontSize: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', marginBottom: '15px' };
    
    // Internal component for handling object URLs safely
    const ManualMediaPreview = ({ file, isSelected, onClick }: { file: File, isSelected: boolean, onClick: (url: string) => void }) => {
        const [url, setUrl] = useState<string | null>(null);
        useEffect(() => {
            const u = URL.createObjectURL(file);
            setUrl(u);
            return () => URL.revokeObjectURL(u);
        }, [file]);

        if (!url) return null;
        return (
            <img 
                src={url} 
                onClick={() => onClick(url)}
                style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: isSelected ? '3px solid var(--primary-color)' : '1px solid var(--border-color)' }}
            />
        );
    };

    return (
        <div style={{ maxWidth: '800px', margin: '40px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <Link href="/" style={{ fontWeight: '500' }}>
                    ← {isNL ? 'Terug naar overzicht' : 'Back to overview'}
                </Link>
            </div>
            <div className="card" style={{ margin: '0' }}>
                <h1 style={{ marginBottom: '20px', textAlign: 'center' }}>{t('addRecipeTitle')}</h1>

                <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '30px', overflowX: 'auto' }}>
                    <button
                        onClick={() => setActiveTab('link')}
                        style={{ flex: 1, padding: '15px', background: 'none', border: 'none', borderBottom: activeTab === 'link' ? '3px solid var(--primary-color)' : 'none', fontWeight: activeTab === 'link' ? 'bold' : 'normal', color: activeTab === 'link' ? 'var(--primary-color)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
                    >
                        {isNL ? 'Link Importeren' : 'Import Link'}
                    </button>
                    {aiEnabled && (
                        <button
                            onClick={() => setActiveTab('photo')}
                            style={{ flex: 1, padding: '15px', background: 'none', border: 'none', borderBottom: activeTab === 'photo' ? '3px solid var(--primary-color)' : 'none', fontWeight: activeTab === 'photo' ? 'bold' : 'normal', color: activeTab === 'photo' ? 'var(--primary-color)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
                        >
                            {isNL ? "Foto('s) Importeren" : 'Import Photo(s)'}
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('manual')}
                        style={{ flex: 1, padding: '15px', background: 'none', border: 'none', borderBottom: activeTab === 'manual' ? '3px solid var(--primary-color)' : 'none', fontWeight: activeTab === 'manual' ? 'bold' : 'normal', color: activeTab === 'manual' ? 'var(--primary-color)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
                    >
                        {isNL ? 'Handmatig Aanmaken' : 'Create Manually'}
                    </button>
                </div>

                {errorLine && (
                    <div style={{ backgroundColor: errorLine.includes(isNL ? 'al in je database' : 'already in your database') ? '#E8F5E9' : '#FCEDED', color: errorLine.includes(isNL ? 'al in je database' : 'already in your database') ? '#2E7D32' : '#B34A4A', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                        {errorLine.includes('/recept/') ? (
                            <>
                                {errorLine.split('/recept/')[0]}
                                <a href={`/recept/${errorLine.split('/recept/')[1]}`} style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 'bold' }}>
                                    /recept/{errorLine.split('/recept/')[1]}
                                </a>
                            </>
                        ) : (
                            errorLine
                        )}
                    </div>
                )}

                {activeTab === 'link' ? (
                    // --- TAB 1: Link Importer ---
                    <div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                            {isNL ? 'Plak een link van Instagram of YouTube (bijv. een Reel) en de digitale oma destilleert automatisch het lijstje en de instructies!' : 'Paste a link from Instagram or YouTube (e.g. a Reel) and the AI will automatically extract the ingredients and instructions!'}
                        </p>
                        <form onSubmit={handleImport}>
                            <div style={{ marginBottom: '20px' }}>
                                <input
                                    type="url"
                                    placeholder="https://www.instagram.com/reel/..."
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    disabled={loading}
                                    required
                                    style={{ ...inputStyle, padding: '16px', marginBottom: '10px' }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <span>{isNL ? 'Deep Search (Forceer AI video & audio analyse)' : 'Deep Search (Force AI video & audio analysis)'}</span>
                                    <div style={{ position: 'relative', width: '44px', height: '24px', backgroundColor: deepSearch ? 'var(--primary-color)' : '#ccc', borderRadius: '24px', transition: 'background-color 0.3s' }}>
                                        <div style={{ position: 'absolute', top: '2px', left: deepSearch ? '22px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={deepSearch}
                                        onChange={e => setDeepSearch(e.target.checked)}
                                        disabled={loading}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>
                            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
                                {loading ? <span className="spinner" style={{ display: 'inline-block', margin: '0 auto', borderTopColor: 'white' }}></span> : (isNL ? 'Genereer Recept ✨' : 'Generate Recipe ✨')}
                            </button>
                        </form>

                        {/* Active Jobs UI */}
                        {jobs.length > 0 && (
                            <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '2px solid var(--border-color)' }}>
                                <h3 style={{ marginBottom: '15px' }}>{isNL ? 'Verwerkingen' : 'Processing Queue'}</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {jobs.map((job) => (
                                        <div key={job.id} style={{
                                            padding: '15px',
                                            borderRadius: '12px',
                                            backgroundColor: job.status === 'ERROR' ? '#FFF5F5' : 'var(--bg-secondary)',
                                            border: `1px solid ${job.status === 'ERROR' ? '#FFEBEB' : 'var(--border-color)'}`,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ flex: 1, overflow: 'hidden', paddingRight: '15px' }}>
                                                <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {job.url}
                                                </p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {job.status === 'PROCESSING' || job.status === 'PENDING' ? (
                                                        <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', borderTopColor: 'var(--primary-color)' }}></span>
                                                    ) : job.status === 'COMPLETED' ? (
                                                        <span style={{ color: '#2E7D32', fontWeight: 'bold' }}>✓</span>
                                                    ) : (
                                                        <span style={{ color: '#C62828', fontWeight: 'bold' }}>✕</span>
                                                    )}
                                                    <span style={{
                                                        fontWeight: '500',
                                                        color: job.status === 'ERROR' ? '#C62828' : job.status === 'COMPLETED' ? '#2E7D32' : 'var(--text-primary)'
                                                    }}>
                                                        {job.message}
                                                    </span>
                                                </div>
                                                {job.error && (
                                                    <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#C62828' }}>
                                                        {job.error}
                                                    </p>
                                                )}
                                            </div>
                                            {job.status === 'COMPLETED' && job.recipeId && (
                                                <button
                                                    onClick={() => router.push(`/recept/${job.recipeId}`)}
                                                    className="btn"
                                                    style={{ padding: '8px 16px', fontSize: '0.9rem', flexShrink: 0 }}
                                                >
                                                    {isNL ? 'Bekijk Recept' : 'View Recipe'}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'photo' ? (
                    // --- TAB 1B: Photo Importer ---
                    <div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                            {isNL ? "Upload foto's van een recept in een kookboek, een ingrediëntenlijstje of zelfs een screenshot. De digitale oma leest het en zet het voor je om!" : 'Upload photos of a recipe from a cookbook, an ingredient list, or even a screenshot. The AI will read it and convert it for you!'}
                        </p>

                        <form onSubmit={handlePhotoSubmit}>
                            <div style={{ marginBottom: '30px' }}>
                                <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', width: '100%', minHeight: '120px' }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handlePhotoSelect}
                                        style={{ position: 'absolute', left: 0, top: 0, opacity: 0, cursor: 'pointer', height: '100%', width: '100%', zIndex: 10 }}
                                    />
                                    <div style={{ ...inputStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', border: '2px dashed var(--primary-color)', transition: 'var(--transition)', width: '100%' }}>
                                        <span style={{ fontSize: '2rem' }}>📸</span>
                                        <span style={{ fontWeight: '500', textAlign: 'center' }}>{isNL ? "Klik hier of sleep foto's hierheen" : 'Click here or drag photos here'}</span>
                                    </div>
                                </div>
                            </div>

                            {photoPreviews.length > 0 && (
                                <div style={{ marginBottom: '30px' }}>
                                    <h4 style={{ marginBottom: '10px' }}>{isNL ? `Geselecteerde foto's (${photoPreviews.length})` : `Selected photos (${photoPreviews.length})`}</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '15px' }}>
                                        {photoPreviews.map((src, idx) => (
                                            <div key={idx} style={{ position: 'relative', paddingTop: '100%', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                                <img src={src} alt="preview" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => handlePhotoRemove(idx)}
                                                    style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', zIndex: 20 }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button type="submit" className="btn" disabled={loading || photos.length === 0} style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
                                {loading ? <span className="spinner" style={{ display: 'inline-block', margin: '0 auto', borderTopColor: 'white' }}></span> : (isNL ? 'Genereer Recept ✨' : 'Generate Recipe ✨')}
                            </button>
                        </form>
                    </div>
                ) : (
                    // --- TAB 2: Manual Data Entry ---
                    <form onSubmit={handleManualSubmit}>

                        {/* Basis Info */}
                        <div style={{ marginBottom: '30px' }}>
                            <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{isNL ? 'Algemeen' : 'General'}</h2>

                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>{isNL ? 'Titel' : 'Title'} *</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder={isNL ? "Bijv. Oma's Appeltaart" : "E.g. Grandma's Apple Pie"} style={{ ...inputStyle, fontSize: '1.4rem', fontWeight: '500' }} />

                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>{isNL ? 'Korte Beschrijving' : 'Short Description'}</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={isNL ? 'Wat maakt dit recept zo lekker?' : 'What makes this recipe so delicious?'} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />

                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', marginBottom: '20px' }}>
                                <strong>{isNL ? 'Voor hoeveel personen?' : 'How many servings?'}</strong>
                                <button type="button" className="btn btn-secondary" onClick={() => setPortions(Math.max(1, portions - 1))} style={{ padding: '8px 12px' }}>-</button>
                                <span style={{ fontSize: '1.2rem', fontWeight: '600', minWidth: '30px', textAlign: 'center' }}>{portions}</span>
                                <button type="button" className="btn btn-secondary" onClick={() => setPortions(portions + 1)} style={{ padding: '8px 12px' }}>+</button>
                            </div>

                            {/* Tag Manager */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>{isNL ? 'Tags (Druk op Enter)' : 'Tags (Press Enter)'}</label>
                                <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px' }}>
                                    {tags.map(t => (
                                        <span key={t} style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            #{t}
                                            <button type="button" onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: '1' }}>✕</button>
                                        </span>
                                    ))}
                                    <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} placeholder={isNL ? 'Typ tag...' : 'Type tag...'} style={{ border: 'none', outline: 'none', flex: 1, minWidth: '100px', padding: '4px', backgroundColor: 'transparent' }} />
                                </div>
                            </div>

                            <div style={{ marginBottom: '30px' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>{isNL ? 'Omslagfoto (Hoofdafbeelding)' : 'Cover Photo (Main Image)'}</label>
                                <div style={{ marginBottom: '15px' }}>
                                    {tempCoverUrl ? (
                                        <div style={{ maxWidth: '400px' }}>
                                            <CoverPhotoSelector 
                                                imageUrl={tempCoverUrl} 
                                                onCrop={(dataUrl: string) => setCoverPhoto(dataUrl)} 
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                            {isNL ? 'Selecteer een foto hieronder om bij te snijden' : 'Select a photo below to crop'}
                                        </div>
                                    )}
                                </div>
                                
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>{isNL ? "Eigen Media Uploaden (Optioneel, foto's & video's)" : 'Upload Media (Optional, photos & videos)'}</label>
                                <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', width: '100%' }}>
                                    <input
                                        type="file"
                                        accept="image/*,video/*"
                                        multiple
                                        onChange={e => {
                                            if (e.target.files) {
                                                const files = Array.from(e.target.files!);
                                                setMediaFiles(prev => [...prev, ...files]);
                                                
                                                // If no cover photo is set, and we just uploaded an image, set it as temp cover
                                                const firstImage = files.find(f => f.type.startsWith('image/'));
                                                if (firstImage && !tempCoverUrl) {
                                                    setTempCoverUrl(URL.createObjectURL(firstImage));
                                                }
                                                e.target.value = '';
                                            }
                                        }}
                                        style={{ position: 'absolute', left: 0, top: 0, opacity: 0, cursor: 'pointer', height: '100%', width: '100%' }} />
                                    <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', border: mediaFiles.length > 0 ? '2px solid var(--primary-color)' : '2px dashed var(--border-color)', transition: 'var(--transition)' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{mediaFiles.length > 0 ? '✅' : '📁'}</span>
                                        <span style={{ fontWeight: '500' }}>{mediaFiles.length > 0 ? (isNL ? `${mediaFiles.length} bestand(en) geselecteerd` : `${mediaFiles.length} file(s) selected`) : (isNL ? "Klik hier om foto's en video's te selecteren..." : 'Click here to select photos and videos...')}</span>
                                    </div>
                                </div>

                                {mediaFiles.filter(f => f.type.startsWith('image/')).length > 0 && (
                                    <div style={{ marginTop: '10px', display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
                                        {mediaFiles.filter(f => f.type.startsWith('image/')).map((f, i) => {
                                            // Find or create object URL
                                            // For simplicity, we can use a ref or just rely on the fact that these are small files.
                                            // But let's be better:
                                            return <ManualMediaPreview key={i} file={f} isSelected={tempCoverUrl !== null && tempCoverUrl.includes(f.name)} onClick={(url) => setTempCoverUrl(url)} />;
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Ingredients */}
                        <div style={{ marginBottom: '30px' }}>
                            <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{t('ingredients')}</h2>
                            {ingredients.map((ing, idx) => (
                                <div key={idx}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                        if (fromIdx === idx) return;
                                        setIngredients(prev => {
                                            const arr = [...prev];
                                            const item = arr.splice(fromIdx, 1)[0];
                                            arr.splice(idx, 0, item);
                                            return arr;
                                        });
                                    }}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', cursor: 'grab' }}
                                >
                                    <div style={{ color: 'var(--text-light)', padding: '0 8px', fontSize: '1.2rem', cursor: 'grab' }} title={isNL ? 'Sleep om te verplaatsen' : 'Drag to reorder'}>
                                        ⋮⋮
                                    </div>
                                    <input type="number" value={ing.amount ?? ''} onChange={e => updateIngredient(idx, 'amount', e.target.value)} placeholder="#" style={{ ...inputStyle, width: '70px', marginBottom: 0, textAlign: 'center' }} />
                                    <input type="text" value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)} placeholder="ml/g" style={{ ...inputStyle, width: '80px', marginBottom: 0 }} />
                                    <input type="text" value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} placeholder={t('ingredientName')} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
                                    <button type="button" onClick={() => removeIngredient(idx)} style={{ background: 'none', border: 'none', color: '#D47B7B', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 8px' }}>✕</button>
                                </div>
                            ))}
                            <button type="button" onClick={addIngredient} className="btn btn-secondary" style={{ marginTop: '8px', padding: '8px 16px', fontSize: '0.85rem' }}>{t('addIngredient')}</button>
                        </div>

                        {/* Steps */}
                        <div style={{ marginBottom: '30px' }}>
                            <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{isNL ? 'Bereidingswijze' : 'Preparation'}</h2>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>{isNL ? 'Tip: Gebruik woorden zoals "15 minuten" in je tekst en de digitale kookwekker pikt dit straks automatisch op!' : 'Tip: Use words like "15 minutes" in your text and the digital cooking timer will automatically pick this up!'}</p>
                            {steps.map((step, idx) => (
                                <div key={idx}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', idx.toString()); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                        if (fromIdx === idx) return;
                                        setSteps(prev => {
                                            const arr = [...prev];
                                            const item = arr.splice(fromIdx, 1)[0];
                                            arr.splice(idx, 0, item);
                                            return arr;
                                        });
                                    }}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '8px', cursor: 'grab' }}
                                >
                                    <div style={{ color: 'var(--text-light)', padding: '10px 8px 0', fontSize: '1.2rem', cursor: 'grab' }} title={isNL ? 'Sleep om te verplaatsen' : 'Drag to reorder'}>
                                        ⋮⋮
                                    </div>
                                    <span style={{ color: 'var(--text-light)', fontWeight: '600', minWidth: '25px', paddingTop: '10px' }}>{idx + 1}.</span>
                                    <textarea value={step.description} onChange={e => updateStep(idx, e.target.value)} placeholder={`${t('step')} ${idx + 1}...`} style={{ ...inputStyle, flex: 1, marginBottom: 0, minHeight: '60px', resize: 'vertical' }} />
                                    <button type="button" onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', color: '#D47B7B', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 8px', marginTop: '8px' }}>✕</button>
                                </div>
                            ))}
                            <button type="button" onClick={addStep} className="btn btn-secondary" style={{ marginTop: '8px', padding: '8px 16px', fontSize: '0.85rem' }}>{t('addStep')}</button>
                        </div>

                        <div style={{ marginTop: '40px', textAlign: 'right' }}>
                            <button type="submit" className="btn" disabled={loading} style={{ padding: '16px 30px', fontSize: '1.1rem' }}>
                                {loading ? <span className="spinner" style={{ display: 'inline-block', margin: '0', borderTopColor: 'white' }}></span> : (isNL ? 'Recept Opslaan 💾' : 'Save Recipe 💾')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
