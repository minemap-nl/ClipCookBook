import { expect, test, describe } from 'bun:test';
import { msUntilNextLocalHour } from './ytdlp-update';

describe('msUntilNextLocalHour', () => {
    test('schedules later today when hour is still ahead', () => {
        const now = new Date(2026, 6, 27, 1, 30, 0); // 01:30
        const ms = msUntilNextLocalHour(3, now);
        expect(ms).toBe(90 * 60 * 1000);
    });

    test('schedules tomorrow when hour already passed', () => {
        const now = new Date(2026, 6, 27, 4, 0, 0); // 04:00
        const ms = msUntilNextLocalHour(3, now);
        expect(ms).toBe(23 * 60 * 60 * 1000);
    });

    test('clamps invalid hours', () => {
        const now = new Date(2026, 6, 27, 12, 0, 0);
        expect(msUntilNextLocalHour(-5, now)).toBe(msUntilNextLocalHour(0, now));
        expect(msUntilNextLocalHour(99, now)).toBe(msUntilNextLocalHour(23, now));
    });
});
