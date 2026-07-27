/** True when PROCESS_METHOD=ai (case-insensitive). Otherwise heuristic/manual extraction. */
export function isAiProcessingEnabled(): boolean {
    return (process.env.PROCESS_METHOD || '').trim().toLowerCase() === 'ai';
}
