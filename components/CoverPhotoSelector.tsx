'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CoverPhotoSelectorProps {
    imageUrl: string;
    onCrop: (dataUrl: string) => void;
}

export default function CoverPhotoSelector({ imageUrl, onCrop }: CoverPhotoSelectorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const panRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        panRef.current = { x: panX, y: panY };
    }, [panX, panY]);

    // Physics/Momentum states (using refs for immediate updates in loops)
    const velocityX = useRef(0);
    const velocityY = useRef(0);
    const momentumID = useRef<number | null>(null);
    const lastTouchX = useRef(0);
    const lastTouchY = useRef(0);
    const lastMoveTime = useRef(0);

    // Interaction states
    const isDragging = useRef(false);
    const isTouching = useRef(false);
    const globalTouchMoved = useRef(false);
    const touchStartPos = useRef({ x: 0, y: 0 });
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const touchStartDist = useRef(0);
    const initialZoom = useRef(0);
    const zoomCenter = useRef({ x: 0, y: 0 });

    const getMinZoom = useCallback(() => {
        if (!containerRef.current || !imageRef.current) return 1;
        const containerW = containerRef.current.offsetWidth;
        const containerH = containerRef.current.offsetHeight;
        const imgW = imageRef.current.naturalWidth || 1;
        const imgH = imageRef.current.naturalHeight || 1;

        const zoomCoverWidth = containerW / imgW;
        const zoomCoverHeight = containerH / imgH;
        return Math.max(zoomCoverWidth, zoomCoverHeight);
    }, []);

    const clampPan = useCallback((x: number, y: number, z: number) => {
        if (!containerRef.current || !imageRef.current) return { x, y };

        const containerW = containerRef.current.offsetWidth;
        const containerH = containerRef.current.offsetHeight;
        const imgW = imageRef.current.naturalWidth;
        const imgH = imageRef.current.naturalHeight;

        const scaledW = imgW * z;
        const scaledH = imgH * z;

        let newX = x;
        let newY = y;

        if (scaledW < containerW) {
            newX = (containerW - scaledW) / 2;
            velocityX.current = 0;
        } else {
            const minX = containerW - scaledW;
            if (newX > 0) { newX = 0; velocityX.current = 0; }
            if (newX < minX) { newX = minX; velocityX.current = 0; }
        }

        if (scaledH < containerH) {
            newY = (containerH - scaledH) / 2;
            velocityY.current = 0;
        } else {
            const minY = containerH - scaledH;
            if (newY > 0) { newY = 0; velocityY.current = 0; }
            if (newY < minY) { newY = minY; velocityY.current = 0; }
        }

        return { x: newX, y: newY };
    }, []);

    const momentumLoop = useCallback(() => {
        velocityX.current *= 0.95;
        velocityY.current *= 0.95;

        if (Math.abs(velocityX.current) < 0.1 && Math.abs(velocityY.current) < 0.1) {
            if (momentumID.current) cancelAnimationFrame(momentumID.current);
            momentumID.current = null;
            return;
        }

        const { x: px, y: py } = panRef.current;
        const nextX = px + velocityX.current;
        const nextY = py + velocityY.current;
        const clamped = clampPan(nextX, nextY, zoom);
        panRef.current = { x: clamped.x, y: clamped.y };
        setPanX(clamped.x);
        setPanY(clamped.y);

        momentumID.current = requestAnimationFrame(momentumLoop);
    }, [zoom, clampPan]);

    const captureCrop = useCallback(() => {
        if (!imageRef.current || !containerRef.current) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Output dimensions (4:3)
        // We'll use a fixed high resolution for the crop, or base it on image size
        const outputWidth = 800;
        const outputHeight = 600;
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const containerW = containerRef.current.offsetWidth;
        const containerH = containerRef.current.offsetHeight;
        const imgW = imageRef.current.naturalWidth;
        const imgH = imageRef.current.naturalHeight;

        // Calculate source rectangle
        // The scale factor between container units and original image pixels
        const scaleFactor = imgW / (imgW * zoom); 
        
        // panX/panY are negative offsets from top-left of container
        const sx = (-panX / zoom) * (imgW / imgW); // This is in original pixels?
        // Let's rethink:
        // container_x = image_pixel_x * zoom + panX
        // image_pixel_x = (container_x - panX) / zoom
        
        // The container displays 0..containerW
        // The corresponding original image pixels are:
        const srcX = -panX / zoom;
        const srcY = -panY / zoom;
        const srcW = containerW / zoom;
        const srcH = containerH / zoom;

        ctx.drawImage(imageRef.current, srcX, srcY, srcW, srcH, 0, 0, outputWidth, outputHeight);
        onCrop(canvas.toDataURL('image/jpeg', 0.85));
    }, [panX, panY, zoom, onCrop]);

    useEffect(() => {
        const minZ = getMinZoom();
        setZoom(minZ);
        setPanX(0);
        setPanY(0);
    }, [imageUrl, getMinZoom]);

    // Apply clamping whenever zoom or pan changes
    useEffect(() => {
        const clamped = clampPan(panX, panY, zoom);
        if (clamped.x !== panX || clamped.y !== panY) {
            setPanX(clamped.x);
            setPanY(clamped.y);
        }
    }, [zoom, panX, panY, clampPan]);

    // Handle Mouse Events
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent text selection/drag start
        isDragging.current = true;
        globalTouchMoved.current = false;

        if (momentumID.current) {
            cancelAnimationFrame(momentumID.current);
            momentumID.current = null;
        }

        touchStartX.current = e.clientX - panX;
        touchStartY.current = e.clientY - panY;
        lastTouchX.current = e.clientX;
        lastTouchY.current = e.clientY;
        velocityX.current = 0;
        velocityY.current = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        globalTouchMoved.current = true;

        velocityX.current = e.clientX - lastTouchX.current;
        velocityY.current = e.clientY - lastTouchY.current;
        lastTouchX.current = e.clientX;
        lastTouchY.current = e.clientY;
        lastMoveTime.current = Date.now();

        const newX = e.clientX - touchStartX.current;
        const newY = e.clientY - touchStartY.current;
        const clamped = clampPan(newX, newY, zoom);
        setPanX(clamped.x);
        setPanY(clamped.y);
    };

    const handleMouseUp = () => {
        if (isDragging.current) {
            isDragging.current = false;
            if (Date.now() - lastMoveTime.current > 100) {
                velocityX.current = 0;
                velocityY.current = 0;
            }
            if (globalTouchMoved.current) momentumLoop();
            captureCrop();
        }
    };

    // Handle Touch Events
    const handleTouchStart = (e: React.TouchEvent) => {
        if (momentumID.current) {
            cancelAnimationFrame(momentumID.current);
            momentumID.current = null;
        }

        if (e.touches.length === 1) {
            isTouching.current = true;
            globalTouchMoved.current = false;

            const t = e.touches[0];
            touchStartX.current = t.clientX - panX;
            touchStartY.current = t.clientY - panY;
            touchStartPos.current = { x: t.clientX, y: t.clientY };
            lastTouchX.current = t.clientX;
            lastTouchY.current = t.clientY;
            velocityX.current = 0;
            velocityY.current = 0;
        } else if (e.touches.length === 2) {
            isTouching.current = true;
            globalTouchMoved.current = true;

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            touchStartDist.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            initialZoom.current = zoom;

            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
                const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
                zoomCenter.current = { x: (midX - panX) / zoom, y: (midY - panY) / zoom };
            }
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isTouching.current) return;
        
        if (e.touches.length === 1) {
            const t = e.touches[0];
            const dx = Math.abs(t.clientX - touchStartPos.current.x);
            const dy = Math.abs(t.clientY - touchStartPos.current.y);

            if (dx > 10 || dy > 10) globalTouchMoved.current = true;

            if (globalTouchMoved.current) {
                velocityX.current = t.clientX - lastTouchX.current;
                velocityY.current = t.clientY - lastTouchY.current;
                lastTouchX.current = t.clientX;
                lastTouchY.current = t.clientY;
                lastMoveTime.current = Date.now();

                const newX = t.clientX - touchStartX.current;
                const newY = t.clientY - touchStartY.current;
                const clamped = clampPan(newX, newY, zoom);
                setPanX(clamped.x);
                setPanY(clamped.y);
            }
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

            const scale = dist / touchStartDist.current;
            const newZoom = Math.min(Math.max(getMinZoom(), initialZoom.current * scale), 4);

            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
                const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

                setZoom(newZoom);
                const newX = midX - (zoomCenter.current.x * newZoom);
                const newY = midY - (zoomCenter.current.y * newZoom);
                const clamped = clampPan(newX, newY, newZoom);
                setPanX(clamped.x);
                setPanY(clamped.y);
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length === 0) {
            isTouching.current = false;
            if (Date.now() - lastMoveTime.current > 100) {
                velocityX.current = 0;
                velocityY.current = 0;
            }
            if (globalTouchMoved.current) momentumLoop();
            captureCrop();
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            touchStartX.current = touch.clientX - panX;
            touchStartY.current = touch.clientY - panY;
            touchStartPos.current = { x: touch.clientX, y: touch.clientY };
            lastTouchX.current = touch.clientX;
            lastTouchY.current = touch.clientY;
            velocityX.current = 0;
            velocityY.current = 0;
        }
    };

    // Native Wheel Listener for Non-Passive preventDefault
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelNative = (e: WheelEvent) => {
            e.preventDefault(); // Prevent page scroll
            if (momentumID.current) cancelAnimationFrame(momentumID.current);

            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.min(Math.max(getMinZoom(), zoom + delta), 4);

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const imgX = (mouseX - panX) / zoom;
            const imgY = (mouseY - panY) / zoom;

            setZoom(newZoom);
            const newX = mouseX - (imgX * newZoom);
            const newY = mouseY - (imgY * newZoom);
            const clamped = clampPan(newX, newY, newZoom);
            setPanX(clamped.x);
            setPanY(clamped.y);
            
            captureCrop();
        };

        container.addEventListener('wheel', handleWheelNative, { passive: false });
        return () => container.removeEventListener('wheel', handleWheelNative);
    }, [zoom, panX, panY, getMinZoom, clampPan, captureCrop]);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [zoom, clampPan, momentumLoop, captureCrop]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                // onWheel is now handled via native listener in useEffect
                style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: 'grab',
                    backgroundColor: '#000',
                    borderRadius: '8px',
                    touchAction: 'none',
                    userSelect: 'none'
                }}
            >
                <div
                    ref={worldRef}
                    style={{
                        position: 'absolute',
                        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                        pointerEvents: 'none'
                    }}
                >
                    <img
                        ref={imageRef}
                        src={imageUrl}
                        alt="Target"
                        style={{ display: 'block', maxWidth: 'none' }}
                        onLoad={() => {
                            const minZ = getMinZoom();
                            setZoom(minZ);
                            setPanX(0);
                            setPanY(0);
                            
                            // Capture the default crop immediately using the new values
                            // We use a short delay to ensure the image is truly rendered and container size is stable
                            setTimeout(() => {
                                if (imageRef.current && containerRef.current) {
                                    const imgW = imageRef.current.naturalWidth;
                                    const imgH = imageRef.current.naturalHeight;
                                    const containerW = containerRef.current.offsetWidth;
                                    const containerH = containerRef.current.offsetHeight;

                                    // Guard against 0 dimensions
                                    if (imgW <= 0 || imgH <= 0 || containerW <= 0 || containerH <= 0) {
                                        console.warn('CoverPhotoSelector: Skipping crop, invalid dimensions', { imgW, imgH, containerW, containerH });
                                        return;
                                    }

                                    const currentMinZ = Math.max(containerW / imgW, containerH / imgH);
                                    
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        canvas.width = 800;
                                        canvas.height = 600;
                                        
                                        const srcW = containerW / currentMinZ;
                                        const srcH = containerH / currentMinZ;
                                        
                                        let sx = 0;
                                        let sy = 0;
                                        if (imgW * currentMinZ < containerW) sx = -(containerW - imgW * currentMinZ) / 2 / currentMinZ;
                                        if (imgH * currentMinZ < containerH) sy = -(containerH - imgH * currentMinZ) / 2 / currentMinZ;

                                        ctx.drawImage(imageRef.current, sx, sy, srcW, srcH, 0, 0, 800, 600);
                                        onCrop(canvas.toDataURL('image/jpeg', 0.85));
                                    }
                                }
                            }, 100);
                        }}
                    />
                </div>
                
                {/* Overlay guides for 4:3 frame if needed, but the container IS the frame */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    border: '2px solid rgba(255,255,255,0.3)',
                    pointerEvents: 'none',
                    boxShadow: 'inset 0 0 100px rgba(0,0,0,0.2)'
                }} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>Zoom: {Math.round(zoom * 100)}%</span>
                <span>{imageUrl.startsWith('data:') ? 'Custom Crop' : 'Original Image'}</span>
            </div>
        </div>
    );
}
