import { expect, test, describe } from 'bun:test';
import { isInstagramUrl } from './instagram-public-meta';

describe('isInstagramUrl', () => {
    test('accepts instagram reel URLs', () => {
        expect(isInstagramUrl('https://www.instagram.com/reel/DX4mHxJIrOt/')).toBe(true);
        expect(isInstagramUrl('https://instagram.com/p/abc123/')).toBe(true);
    });

    test('rejects other hosts', () => {
        expect(isInstagramUrl('https://www.youtube.com/watch?v=x')).toBe(false);
        expect(isInstagramUrl('not-a-url')).toBe(false);
    });
});
