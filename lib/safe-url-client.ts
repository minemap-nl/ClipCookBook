import { hrefIfHttpUrl } from '@/lib/normalize-source-url';

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_MEDIA_PATH_RE = /^\/api\/(thumbnail|v|upload)\/[^?#]*$/;

/** Safe value for img/video src in the UI (blocks javascript: and unsafe data: URLs). */
export function safeImageSrc(raw: string | null | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (LOCAL_MEDIA_PATH_RE.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/api/') && !trimmed.includes('..') && !trimmed.includes('\\')) return trimmed;
    if (DATA_IMAGE_RE.test(trimmed)) return trimmed;
    return hrefIfHttpUrl(trimmed);
}

/** Safe value for external links (original recipe source). */
export function safeExternalHref(raw: string | null | undefined): string {
    if (!raw) return '';
    return hrefIfHttpUrl(raw.trim());
}
