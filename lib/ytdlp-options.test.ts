import { expect, test, describe, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    formatYtdlpError,
    getYtdlpCookieFlags,
    withYtdlpCookies,
    areYtdlpCookiesConfigured,
} from './ytdlp-options';

describe('getYtdlpCookieFlags', () => {
    const prev = process.env.YT_DLP_COOKIES;

    afterEach(() => {
        if (prev === undefined) delete process.env.YT_DLP_COOKIES;
        else process.env.YT_DLP_COOKIES = prev;
    });

    test('returns empty when env unset and default file missing', () => {
        delete process.env.YT_DLP_COOKIES;
        // default path may or may not exist in workspace; flags only when file exists
        const flags = getYtdlpCookieFlags();
        if (!fs.existsSync(path.resolve(process.cwd(), 'data', 'cookies.txt'))) {
            expect(flags).toEqual({});
        }
    });

    test('areYtdlpCookiesConfigured is true when env set even if file missing', () => {
        process.env.YT_DLP_COOKIES = path.join(os.tmpdir(), 'missing-cookies-file.txt');
        expect(areYtdlpCookiesConfigured()).toBe(true);
        expect(getYtdlpCookieFlags()).toEqual({});
    });

    test('returns cookies path when file exists', () => {
        const tmp = path.join(os.tmpdir(), `yt-cookies-${Date.now()}.txt`);
        fs.writeFileSync(tmp, '# Netscape HTTP Cookie File\n');
        try {
            process.env.YT_DLP_COOKIES = tmp;
            expect(getYtdlpCookieFlags()).toEqual({ cookies: tmp });
            expect(withYtdlpCookies({ noPlaylist: true })).toEqual({ noPlaylist: true, cookies: tmp });
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

describe('formatYtdlpError', () => {
    test('adds cookie hint for Instagram empty media response', () => {
        const msg = formatYtdlpError(new Error('Instagram sent an empty media response'));
        expect(msg).toContain('Instagram blokkeert videodownload');
        expect(msg).toContain('/cookies');
    });

    test('passes through unrelated errors', () => {
        expect(formatYtdlpError(new Error('network timeout'))).toBe('network timeout');
    });
});

describe('isYtdlpAuthError', () => {
    test('detects empty media response', async () => {
        const { isYtdlpAuthError } = await import('./ytdlp-options');
        expect(isYtdlpAuthError(new Error('empty media response'))).toBe(true);
        expect(isYtdlpAuthError(new Error('network timeout'))).toBe(false);
    });
});
