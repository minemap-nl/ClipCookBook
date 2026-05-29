'use client';

import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes, VideoHTMLAttributes } from 'react';
import { safeExternalHref, safeImageSrc } from '@/lib/safe-url-client';

type SafeImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    url: string | null | undefined;
};

/** Renders img only when url passes allowlist (central DOM XSS guard). */
export const SafeImg = forwardRef<HTMLImageElement, SafeImgProps>(function SafeImg(
    { url, ...props },
    ref
) {
    const src = safeImageSrc(url);
    if (!src) return null;
    return <img {...props} ref={ref} src={src} />;
});

type SafeVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
    url: string | null | undefined;
    /** Append #t=0.001 for iOS first-frame preview */
    previewHack?: boolean;
};

export const SafeVideo = forwardRef<HTMLVideoElement, SafeVideoProps>(function SafeVideo(
    { url, previewHack, ...props },
    ref
) {
    const base = safeImageSrc(url);
    if (!base) return null;
    const src = previewHack ? `${base}#t=0.001` : base;
    return <video {...props} ref={ref} src={src} />;
});

type SafeExternalLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    url: string | null | undefined;
};

export function SafeExternalLink({ url, children, ...props }: SafeExternalLinkProps) {
    const href = safeExternalHref(url);
    if (!href) return null;
    return (
        <a {...props} href={href} target="_blank" rel="noreferrer noopener">
            {children}
        </a>
    );
}
