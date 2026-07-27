import { expect, test, describe, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    clearYtdlpCookiesAlertFlag,
    maybeSendYtdlpCookiesAlert,
    noteYtdlpAuthOutcome,
} from './ytdlp-cookies-alert';

describe('ytdlp-cookies-alert', () => {
    const prevCookies = process.env.YT_DLP_COOKIES;
    const prevCwd = process.cwd();
    let tmpDir = '';

    afterEach(async () => {
        if (prevCookies === undefined) delete process.env.YT_DLP_COOKIES;
        else process.env.YT_DLP_COOKIES = prevCookies;
        process.chdir(prevCwd);
        if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        tmpDir = '';
    });

    test('skips alert when cookies are not configured', async () => {
        delete process.env.YT_DLP_COOKIES;
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-alert-'));
        process.chdir(tmpDir);

        await maybeSendYtdlpCookiesAlert('should not send');

        const stateFile = path.join(tmpDir, 'data', 'ytdlp-cookies-alert.json');
        await expect(fs.access(stateFile)).rejects.toThrow();
    });

    test('clearYtdlpCookiesAlertFlag removes state file', async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-alert-'));
        process.chdir(tmpDir);
        await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
        const stateFile = path.join(tmpDir, 'data', 'ytdlp-cookies-alert.json');
        await fs.writeFile(stateFile, JSON.stringify({ notified: true }));

        await clearYtdlpCookiesAlertFlag();
        await expect(fs.access(stateFile)).rejects.toThrow();
    });

    test('noteYtdlpAuthOutcome(true) clears flag when cookies configured', async () => {
        process.env.YT_DLP_COOKIES = '/tmp/fake-cookies.txt';
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-alert-'));
        process.chdir(tmpDir);
        await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
        const stateFile = path.join(tmpDir, 'data', 'ytdlp-cookies-alert.json');
        await fs.writeFile(stateFile, JSON.stringify({ notified: true }));

        await noteYtdlpAuthOutcome(true);
        await expect(fs.access(stateFile)).rejects.toThrow();
    });
});
