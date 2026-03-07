import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        aiEnabled: process.env.PROCESS_METHOD === 'ai'
    });
}
