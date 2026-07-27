import { NextResponse } from 'next/server';
import { isAiProcessingEnabled } from '@/lib/process-method';

export async function GET() {
    return NextResponse.json({
        aiEnabled: isAiProcessingEnabled(),
    });
}
