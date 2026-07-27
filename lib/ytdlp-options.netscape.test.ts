import { expect, test, describe } from 'bun:test';
import { validateNetscapeCookies } from './ytdlp-options';

const sampleOk = `# Netscape HTTP Cookie File
.instagram.com	TRUE	/	TRUE	1999999999	sessionid	abc123
.instagram.com	TRUE	/	TRUE	1999999999	ds_user_id	42
`;

describe('validateNetscapeCookies', () => {
    test('accepts valid Instagram netscape file', () => {
        const r = validateNetscapeCookies(sampleOk);
        expect(r.ok).toBe(true);
        expect(r.hasSessionId).toBe(true);
        expect(r.hasDsUserId).toBe(true);
        expect(r.lineCount).toBe(2);
    });

    test('rejects missing sessionid', () => {
        const r = validateNetscapeCookies(
            `.instagram.com\tTRUE\t/\tTRUE\t1999999999\tcsrftoken\tx\n`
        );
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/sessionid/i);
    });

    test('rejects empty', () => {
        expect(validateNetscapeCookies('').ok).toBe(false);
    });
});
