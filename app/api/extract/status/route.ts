import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const urlObj = new URL(req.url);
        const limitStr = urlObj.searchParams.get('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 50;

        // Get all pending/processing jobs, plus a few recently completed/error ones
        const activeJobs = await prisma.importJob.findMany({
            where: {
                status: { in: ['PENDING', 'PROCESSING'] }
            },
            orderBy: { createdAt: 'desc' }
        });

        const recentFinishedJobs = await prisma.importJob.findMany({
            where: {
                status: { in: ['COMPLETED', 'ERROR'] }
            },
            orderBy: { updatedAt: 'desc' },
            take: 10 // Alleen de laatste 10 voltooide/gefaalde laten zien in UI geschiedenis
        });

        // Combine them and sort by newest first
        const allJobs = [...activeJobs, ...recentFinishedJobs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return NextResponse.json({ success: true, jobs: allJobs.slice(0, limit) });

    } catch (error: any) {
        console.error("Fout bij ophalen import status:", error);
        return NextResponse.json({ error: "Kan status niet ophalen", details: error.message }, { status: 500 });
    }
}
