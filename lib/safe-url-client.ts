import { hrefIfHttpUrl } from '@/lib/normalize-source-url';

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_MEDIA_PATH_RE = /^\/api\/(thumbnail|v|upload)\/[^?#]*$/;
const BLOB_IMAGE_RE = /^blob:/i;

/** Safe value for img/video src in the UI (blocks javascript: and unsafe data: URLs). */
export function safeImageSrc(raw: string | null | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (LOCAL_MEDIA_PATH_RE.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/api/') && !trimmed.includes('..') && !trimmed.includes('\\')) return trimmed;
    if (BLOB_IMAGE_RE.test(trimmed)) return trimmed;
    if (DATA_IMAGE_RE.test(trimmed)) return trimmed;
    return hrefIfHttpUrl(trimmed);
}

/** Safe value for external links (original recipe source). */
export function safeExternalHref(raw: string | null | undefined): string {
    if (!raw) return '';
    return hrefIfHttpUrl(raw.trim());
}

/** Same-origin relative path only (blocks open redirects via ?from=). */
export function safeRedirectPath(raw: string | null | undefined): string {
    if (!raw) return '/';
    const path = raw.trim();
    if (!path.startsWith('/') || path.startsWith('//')) return '/';
    if (/[:\\@]/.test(path)) return '/';
    return path;
}

/** Normalize recipe media/url fields once when loading from the API. */
export function sanitizeRecipeForDisplay<T extends Record<string, unknown>>(recipe: T): T {
    const out = { ...recipe } as Record<string, unknown>;
    for (const key of ['thumbnailPath', 'originalThumbnail', 'videoPath'] as const) {
        if (typeof out[key] === 'string') {
            const safe = safeImageSrc(out[key] as string);
            out[key] = safe || null;
        }
    }
    if (typeof out.originalUrl === 'string') {
        const safe = safeExternalHref(out.originalUrl as string);
        out.originalUrl = safe || null;
    }
    if (typeof out.mediaGallery === 'string' && out.mediaGallery) {
        out.mediaGallery = (out.mediaGallery as string)
            .split(',')
            .map((u) => safeImageSrc(u.trim()))
            .filter(Boolean)
            .join(',');
    }
    if (typeof out.suggestedThumbnails === 'string' && out.suggestedThumbnails) {
        out.suggestedThumbnails = (out.suggestedThumbnails as string)
            .split(',')
            .map((u) => safeImageSrc(u.trim()))
            .filter(Boolean)
            .join(',');
    }
    return out as T;
}
