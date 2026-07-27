import { JSDOM } from 'jsdom';
import { getSafeFetchUrl, safeFetch } from '@/lib/safe-url';

export type InstagramPublicMeta = {
    title: string;
    description: string;
    thumbnailUrl: string | null;
    source: 'embed' | 'none';
};

function isInstagramUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
        return host === 'instagram.com' || host.endsWith('.instagram.com');
    } catch {
        return false;
    }
}

function shortcodeFromInstagramUrl(url: string): string | null {
    try {
        const u = new URL(url);
        const m = u.pathname.match(/\/(reel|p|tv)\/([^/?#]+)/i);
        return m?.[2] || null;
    } catch {
        return null;
    }
}

function metaFromHtml(html: string): Omit<InstagramPublicMeta, 'source'> {
    const document = new JSDOM(html).window.document;
    const og = (prop: string) =>
        document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content')?.trim() || '';

    let title = og('og:title') || document.title || '';
    let description =
        og('og:description') ||
        document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
        '';
    const thumbnailUrl = getSafeFetchUrl(og('og:image')) || null;

    // Embed pages sometimes put caption in a visible block
    if (description.length < 40) {
        const captionEl =
            document.querySelector('.Caption') ||
            document.querySelector('[data-testid="post-comment-root"]') ||
            document.querySelector('blockquote');
        const extra = captionEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (extra.length > description.length) description = extra;
    }

    // Strip Instagram chrome from titles like "Username on Instagram: …"
    title = title.replace(/\s+on Instagram:?\s*/i, ': ').trim();

    return { title, description, thumbnailUrl };
}

/**
 * Best-effort public metadata without login. Instagram often still gates this;
 * returns empty description when blocked so callers can fail clearly.
 */
export async function fetchInstagramPublicMeta(url: string): Promise<InstagramPublicMeta> {
    if (!isInstagramUrl(url)) {
        return { title: '', description: '', thumbnailUrl: null, source: 'none' };
    }

    const code = shortcodeFromInstagramUrl(url);
    const candidates = code
        ? [
              `https://www.instagram.com/reel/${code}/embed/captioned/`,
              `https://www.instagram.com/p/${code}/embed/captioned/`,
              `https://www.instagram.com/reel/${code}/embed/`,
              `https://www.instagram.com/p/${code}/embed/`,
          ]
        : [url];

    const headers = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
    };

    for (const candidate of candidates) {
        try {
            const res = await safeFetch(candidate, { headers, signal: AbortSignal.timeout(12_000) });
            if (!res || !res.ok) continue;
            const html = await res.text();
            if (/log in|login|sign up/i.test(html) && !/og:description/i.test(html)) continue;
            const meta = metaFromHtml(html);
            if (meta.description.length >= 20 || meta.title.length >= 5) {
                return { ...meta, source: 'embed' };
            }
        } catch {
            // try next
        }
    }

    return { title: '', description: '', thumbnailUrl: null, source: 'none' };
}

export { isInstagramUrl };
