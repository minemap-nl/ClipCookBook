'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function Home() {
    const { t, isNL } = useI18n();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());
    const [showShoppingList, setShowShoppingList] = useState(false);
    const [showPortionModal, setShowPortionModal] = useState(false);
    const [shoppingListPortions, setShoppingListPortions] = useState<Record<string, number>>({});
    const [shoppingListText, setShoppingListText] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Queue State
    const [activeJobs, setActiveJobs] = useState<any[]>([]);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const res = await fetch('/api/extract/status?limit=10');
                if (res.ok) {
                    const data = await res.json();
                    setActiveJobs(data.jobs?.filter((j: any) => j.status === 'PROCESSING' || j.status === 'PENDING') || []);
                }
            } catch (e) {
                console.error("Failed to fetch active jobs", e);
            }
        };

        fetchJobs();
        const interval = setInterval(fetchJobs, 3000); // poll elke 3 seconden
        return () => clearInterval(interval);
    }, []);
    useEffect(() => {
        fetch('/api/recept', { credentials: 'include' })
            .then(res => {
                if (res.status === 401) { window.location.reload(); return; }
                return res.json();
            })
            .then(data => {
                if (!data) return;
                setRecipes(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });
    }, []);

    const filtered = recipes.filter(r => {
        const s = search.toLowerCase();
        const inTitle = r.title.toLowerCase().includes(s);
        const inIngredients = r.ingredients?.some((i: any) => i.name.toLowerCase().includes(s));
        const startsWithTagSearch = r.tags?.toLowerCase().includes(s);
        const textMatch = inTitle || inIngredients || startsWithTagSearch;

        let tagsMatch = true;
        if (selectedTags.length > 0) {
            if (!r.tags) tagsMatch = false;
            else {
                const recipeTags = r.tags.split(',').map((t: string) => t.trim().toLowerCase());
                tagsMatch = selectedTags.every(t => recipeTags.includes(t.toLowerCase()));
            }
        }
        return textMatch && tagsMatch;
    });

    const allUniqueTags = Array.from(new Set(
        recipes.flatMap(r => r.tags ? r.tags.split(',').map((t: string) => t.trim()) : [])
    )).filter(Boolean).sort() as string[];

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        setSelectedRecipes(new Set());
        setShoppingListPortions({});
    };

    const toggleRecipeSelection = (e: React.MouseEvent, id: string) => {
        if (!selectionMode) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedRecipes(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                setShoppingListPortions(p => { const newP = { ...p }; delete newP[id]; return newP; });
            } else {
                next.add(id);
                const r = recipes.find(rec => rec.id === id);
                setShoppingListPortions(p => ({ ...p, [id]: r?.portions || 4 }));
            }
            return next;
        });
    };

    const openPortionModal = () => {
        setShowPortionModal(true);
    };

    const generateShoppingList = () => {
        const selected = recipes.filter(r => selectedRecipes.has(r.id));
        const ingredientsMap = new Map<string, { amount: number | null, unit: string }>();

        selected.forEach(r => {
            const targetPortion = shoppingListPortions[r.id] || r.portions || 4;
            const originalPortion = r.portions || 4;
            const multiplier = targetPortion / originalPortion;

            r.ingredients?.forEach((ing: any) => {
                const standardizedName = ing.name.trim().toLowerCase();
                const standardizedUnit = (ing.unit || '').trim().toLowerCase();
                const key = `${standardizedName}|${standardizedUnit}`;

                const amountToAdd = ing.amount ? (ing.amount * multiplier) : null;

                if (ingredientsMap.has(key)) {
                    const existing = ingredientsMap.get(key)!;
                    ingredientsMap.set(key, {
                        amount: (existing.amount ?? 0) + (amountToAdd ?? 0),
                        unit: existing.unit || standardizedUnit // Keep original formatting if possible, else lowercase
                    });
                } else {
                    ingredientsMap.set(key, { amount: amountToAdd, unit: ing.unit || '' });
                }
            });
        });

        let listContent = isNL ? "🛒 Boodschappenlijst:\n\n" : "🛒 Shopping List:\n\n";

        // Group by category if we wanted to, but for now just sort alphabetically
        const sortedKeys = Array.from(ingredientsMap.keys()).sort();

        sortedKeys.forEach(key => {
            const val = ingredientsMap.get(key)!;
            const [name, _unit] = key.split('|');

            // Format amount nicely (e.g., 2.5 instead of 2.50000000)
            let amountStr = '';
            if (val.amount !== null && val.amount > 0) {
                // Round to 2 decimal places max to avoid floating point weirdness
                const roundedAmount = Math.round(val.amount * 100) / 100;
                amountStr = `${roundedAmount} `;
            }

            const unitStr = val.unit ? `${val.unit} ` : '';
            // Capitalize first letter of name
            const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

            listContent += `- ${amountStr}${unitStr}${capitalizedName}\n`;
        });

        setShoppingListText(listContent);
        setShowPortionModal(false);
        setShowShoppingList(true);
    };

    const copyShoppingList = async () => {
        try {
            await navigator.clipboard.writeText(shoppingListText);
            alert(t('copied'));
            setShowShoppingList(false);
            setSelectionMode(false);
            setSelectedRecipes(new Set());
            setShoppingListPortions({});
        } catch (err) {
            alert(isNL ? "Kopiëren mislukt." : "Copy failed.");
        }
    };

    return (
        <div>
            <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                <h1 style={{ fontSize: 'clamp(1.5rem, 7vw, 2.5rem)', marginBottom: '10px', whiteSpace: 'nowrap' }}>{isNL ? 'Welkom in de Keuken' : 'Welcome to the Kitchen'}</h1>
                <p style={{ color: 'var(--text-secondary)' }}>{isNL ? 'Vind eenvoudig al je bewaarde recepten terug.' : 'Easily find all your saved recipes.'}</p>
            </div>

            {activeJobs.length > 0 && (
                <div style={{
                    marginBottom: '20px',
                    padding: '12px 20px',
                    backgroundColor: 'rgba(255, 90, 95, 0.05)',
                    border: '1px solid rgba(255, 90, 95, 0.3)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: 'var(--primary-color)' }}></span>
                    <span style={{ fontSize: '0.95rem', fontWeight: '500', color: 'var(--primary-color)' }}>
                        {activeJobs.length} {activeJobs.length === 1 ? t('recept') : t('recepten')} {isNL ? 'aan het importeren op de achtergrond...' : 'importing in the background...'}
                    </span>
                    <Link href="/toevoegen" style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'underline' }}>
                        {isNL ? 'Bekijk details' : 'View details'}
                    </Link>
                </div>
            )}

            <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        placeholder={isNL ? 'Zoek naar een recept of ingrediënt...' : 'Search for a recipe or ingredient...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, padding: '16px 20px', fontSize: '1.1rem', borderRadius: 'var(--border-radius)', border: '2px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}
                    />
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`btn ${showFilters || selectedTags.length > 0 ? 'btn' : 'btn-secondary'}`}
                        style={{ padding: '0 20px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        title={isNL ? 'Filters bekijken' : 'View filters'}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                        {selectedTags.length > 0 && (
                            <span style={{ backgroundColor: 'white', color: 'var(--primary-color)', borderRadius: '50%', width: '22px', height: '22px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                {selectedTags.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={toggleSelectionMode}
                        className={`btn ${selectionMode ? 'btn' : 'btn-secondary'}`}
                        style={{ padding: '0 20px', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={t('generateList')}
                    >
                        🛒
                    </button>
                    {selectionMode && selectedRecipes.size > 0 && (
                        <button onClick={openPortionModal} className="btn" style={{ padding: '0 20px' }}>
                            {isNL ? 'Maak Lijst' : 'Generate List'} ({selectedRecipes.size})
                        </button>
                    )}
                </div>

                {allUniqueTags.length > 0 && showFilters && (
                    <div style={{ marginTop: '10px', padding: '15px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                                🏷️ {isNL ? 'Filter op Categorie:' : 'Filter by Category:'}
                            </span>
                            {selectedTags.length > 0 && (
                                <button
                                    onClick={() => setSelectedTags([])}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '4px 8px' }}
                                >
                                    ✕ {isNL ? 'Wis alle filters' : 'Clear all filters'}
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {allUniqueTags.map((tag: string) => {
                                const isSelected = selectedTags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '25px', fontSize: '0.95rem', fontWeight: '500',
                                            cursor: 'pointer', transition: 'all 0.2s ease', border: '2px solid',
                                            backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                                            color: isSelected ? 'white' : 'var(--text-secondary)',
                                            borderColor: isSelected ? 'var(--primary-color)' : 'var(--border-color)',
                                            boxShadow: isSelected ? '0 4px 12px rgba(255, 90, 95, 0.25)' : 'none',
                                            transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                                        }}
                                        onMouseOver={e => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = 'var(--text-light)';
                                            }
                                        }}
                                        onMouseOut={e => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                            }
                                        }}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <div className="spinner" style={{ borderTopColor: 'var(--primary-color)' }}></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                    <h3 style={{ color: 'var(--text-secondary)' }}>{isNL ? 'Geen recepten gevonden' : 'No recipes found'}</h3>
                    <p>{isNL ? 'Probeer een ander trefwoord, of voeg een nieuw recept toe!' : 'Try a different keyword, or add a new recipe!'}</p>
                    <Link href="/toevoegen" className="btn" style={{ marginTop: '20px' }}>
                        {t('addNewRecipe')}
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {filtered.map(recipe => {
                        const isSelected = selectedRecipes.has(recipe.id);

                        const cardContent = (
                            <div
                                className="card"
                                style={{
                                    height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
                                    border: selectionMode && isSelected ? '3px solid var(--primary-color)' : '3px solid transparent',
                                    transform: selectionMode && isSelected ? 'scale(0.98)' : 'scale(1)',
                                    transition: 'var(--transition)'
                                }}
                            >
                                {/* Thumbnail afbeelding */}
                                {recipe.thumbnailPath ? (
                                    <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', backgroundColor: '#f0f0f0' }}>
                                        <img
                                            src={recipe.thumbnailPath}
                                            alt={recipe.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                            loading="lazy"
                                        />
                                    </div>
                                ) : recipe.videoPath ? (
                                    <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', backgroundColor: '#000' }}>
                                        <video
                                            src={recipe.videoPath}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                            preload="metadata"
                                            muted
                                        />
                                    </div>
                                ) : null}

                                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h2 style={{ fontSize: '1.3rem', marginBottom: '6px', lineHeight: '1.3', flex: 1 }}>
                                            {recipe.title}
                                        </h2>
                                        {selectionMode && (
                                            <div
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    border: `2px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                                    backgroundColor: isSelected ? 'var(--primary-color)' : 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    marginLeft: '10px', flexShrink: 0
                                                }}
                                            >
                                                {isSelected && <span style={{ color: 'white', fontSize: '16px' }}>✓</span>}
                                            </div>
                                        )}
                                    </div>
                                    {recipe.tags && recipe.tags.split(',').length > 0 && (
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                            {recipe.tags.split(',').slice(0, 3).map((tag: string, i: number) => (
                                                <span key={i} style={{ backgroundColor: '#F0E8DD', color: 'var(--secondary-color)', padding: '2px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600' }}>
                                                    {tag.trim()}
                                                </span>
                                            ))}
                                            {recipe.tags.split(',').length > 3 && (
                                                <span style={{ color: 'var(--text-light)', fontSize: '0.75rem', fontWeight: '600', padding: '2px 4px' }}>
                                                    +{recipe.tags.split(',').length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                                        {recipe.description && (
                                            <p style={{ marginBottom: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {recipe.description}
                                            </p>
                                        )}
                                        <p>{isNL ? 'Voor' : 'For'} {recipe.portions} {isNL ? 'personen' : 'servings'} · {recipe.ingredients?.length || 0} {t('ingredients').toLowerCase()}</p>
                                    </div>
                                </div>
                            </div>
                        );

                        if (selectionMode) {
                            return (
                                <div key={recipe.id} onClick={(e) => toggleRecipeSelection(e, recipe.id)} style={{ cursor: 'pointer', display: 'block' }}>
                                    {cardContent}
                                </div>
                            );
                        }

                        return (
                            <Link href={`/recept/${recipe.id}`} key={recipe.id} style={{ display: 'block', textDecoration: 'none' }}>
                                {cardContent}
                            </Link>
                        );
                    })}
                </div>
            )}

            {showPortionModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                    <div className="card" style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        <h2 style={{ marginBottom: '15px' }}>{isNL ? 'Voor hoeveel personen?' : 'How many servings?'}</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{isNL ? 'Pas indien nodig het aantal personen per recept aan voordat de lijst wordt gegenereerd.' : 'Adjust the number of servings per recipe before the list is generated.'}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
                            {recipes.filter(r => selectedRecipes.has(r.id)).map(recipe => (
                                <div key={recipe.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                    <span style={{ fontWeight: '500', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '10px' }}>
                                        {recipe.title}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setShoppingListPortions(p => ({ ...p, [recipe.id]: Math.max(1, (p[recipe.id] || recipe.portions || 4) - 1) }))}>-</button>
                                        <span style={{ fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{shoppingListPortions[recipe.id] || recipe.portions || 4}</span>
                                        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setShoppingListPortions(p => ({ ...p, [recipe.id]: (p[recipe.id] || recipe.portions || 4) + 1 }))}>+</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn" style={{ flex: 1 }} onClick={generateShoppingList}>{isNL ? 'Genereer' : 'Generate'}</button>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPortionModal(false)}>{t('cancel')}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showShoppingList && createPortal(
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                    <div className="card" style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ marginBottom: '15px' }}>{t('shoppingList')}</h2>
                        <textarea
                            value={shoppingListText}
                            readOnly
                            style={{ flex: 1, minHeight: '300px', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'monospace', fontSize: '0.95rem', resize: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="btn" style={{ flex: 1 }} onClick={copyShoppingList}>📋 {t('copyToClipboard')}</button>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowShoppingList(false); setSelectionMode(false); setSelectedRecipes(new Set()); }}>{t('close')}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
