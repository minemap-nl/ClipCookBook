import { expect, test, describe, afterEach } from 'bun:test';
import { isAiProcessingEnabled } from './process-method';

describe('isAiProcessingEnabled', () => {
    const prev = process.env.PROCESS_METHOD;

    afterEach(() => {
        if (prev === undefined) delete process.env.PROCESS_METHOD;
        else process.env.PROCESS_METHOD = prev;
    });

    test('true for ai (case-insensitive)', () => {
        process.env.PROCESS_METHOD = 'ai';
        expect(isAiProcessingEnabled()).toBe(true);
        process.env.PROCESS_METHOD = 'AI';
        expect(isAiProcessingEnabled()).toBe(true);
        process.env.PROCESS_METHOD = ' Ai ';
        expect(isAiProcessingEnabled()).toBe(true);
    });

    test('false for manual / unset', () => {
        process.env.PROCESS_METHOD = 'manual';
        expect(isAiProcessingEnabled()).toBe(false);
        delete process.env.PROCESS_METHOD;
        expect(isAiProcessingEnabled()).toBe(false);
    });
});
