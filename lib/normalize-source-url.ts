/**
 * Normalizes social / video source URLs for deduplication and yt-dlp.
 *
 * Removes common tracking query params (igsh, utm_*, fbclid, TikTok webapp params, …) but keeps
 * params that identify the asset or playback: e.g. YouTube `v`, `t`, `start`, `end`.
 *
 * On YouTube (watch, Shorts, youtu.be, live, …) **`list` and `index` are dropped** so we only
 * reference the one video, not the surrounding playlist. Pure `/playlist` URLs keep `list`.
 *
 * Path-only IDs stay intact: Instagram /reel/ /p/, TikTok /video/, YouTube /shorts/, youtu.be/…
 */
const TRACKING_PARAM_PREFIXES = ['utm_'];

const TRACKING_PARAMS = new Set(
    [
        // Instagram
        'igsh',
        'ig_rid',
        'igshid',
        'ref',
        'ref_src',
        '_nc_ht',
        '_nc_cat',
        '_nc_ohc',
        '_nc_gid',
        '_nc_oc',
        // Facebook / Meta
        'fbclid',
        'fb_action_ids',
        'fb_action_types',
        // Ads / analytics
        'gclid',
        'dclid',
        'mc_cid',
        'mc_eid',
        'sr_share',
        // YouTube UI / share noise (not v= / list=)
        'si',
        'pp',
        'feature',
        'ab_channel',
        // TikTok web / client hints (video id is in the path)
        'is_from_webapp',
        'sender_device',
        'sender_web_id',
        'web_id',
        // Twitter/X
        'twclid',
        // Reddit promo
        'rdt',
    ].map((s) => s.toLowerCase())
);

/** Returns canonical href for http(s) URLs; empty string if invalid (avoid DOMPurify mangling & in query). */
export function hrefIfHttpUrl(raw: string): string {
    try {
        const u = new URL(raw.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return u.href;
    } catch {
        return '';
    }
}

export function normalizeSourceUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    try {
        const u = new URL(trimmed);
        const keys = [...u.searchParams.keys()];
        for (const key of keys) {
            const low = key.toLowerCase();
            if (TRACKING_PARAMS.has(low) || TRACKING_PARAM_PREFIXES.some((p) => low.startsWith(p))) {
                u.searchParams.delete(key);
            }
        }

        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        const isYoutube =
            host === 'youtube.com' ||
            host === 'youtube-nocookie.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtu.be';
        if (isYoutube) {
            const p = u.pathname.toLowerCase();
            const isPlaylistOnlyPage = p === '/playlist' || p.startsWith('/playlist/');
            if (!isPlaylistOnlyPage) {
                u.searchParams.delete('list');
                u.searchParams.delete('index');
            }
        }

        const q = u.searchParams.toString();
        u.search = q ? `?${q}` : '';
        return u.href;
    } catch {
        return trimmed;
    }
}

/** Normalize + canonical `URL.href` for dedup and stable DB storage (query order independent). */
export function canonicalSourceUrl(raw: string): string {
    const n = normalizeSourceUrl(raw.trim());
    return hrefIfHttpUrl(n) || n;
}
