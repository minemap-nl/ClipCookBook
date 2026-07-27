import { expect, test, describe } from 'bun:test';
import { canonicalSourceUrl, hrefIfHttpUrl, normalizeSourceUrl } from './normalize-source-url';

describe('normalizeSourceUrl', () => {
    test('strips Instagram tracking params', () => {
        const raw = 'https://www.instagram.com/reel/ABC123/?igsh=foo&utm_source=share';
        expect(normalizeSourceUrl(raw)).toBe('https://www.instagram.com/reel/ABC123/');
    });

    test('drops YouTube playlist params on watch URLs', () => {
        const raw = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest&index=2';
        expect(normalizeSourceUrl(raw)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    test('keeps list on pure playlist URLs', () => {
        const raw = 'https://www.youtube.com/playlist?list=PLtest';
        expect(normalizeSourceUrl(raw)).toBe('https://www.youtube.com/playlist?list=PLtest');
    });

    test('normalizes youtu.be short links', () => {
        const raw = 'https://youtu.be/dQw4w9WgXcQ?si=noise';
        expect(normalizeSourceUrl(raw)).toBe('https://youtu.be/dQw4w9WgXcQ');
    });
});

describe('canonicalSourceUrl', () => {
    test('returns http href for valid URLs', () => {
        expect(canonicalSourceUrl('https://example.com/reel/abc?igsh=x')).toBe(
            'https://example.com/reel/abc'
        );
    });
});

describe('hrefIfHttpUrl', () => {
    test('accepts https URLs', () => {
        expect(hrefIfHttpUrl('https://tiktok.com/@user/video/123')).toContain('https://');
    });

    test('rejects non-http schemes', () => {
        expect(hrefIfHttpUrl('javascript:alert(1)')).toBe('');
    });
});
