import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
    try {
        // Derive DB path from DATABASE_URL (e.g. "file:/app/data/dev.db" or "file:./dev.db")
        const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
        const strippedPath = dbUrl.replace(/^file:/, '');
        const dbPath = path.resolve(process.cwd(), strippedPath);

        const backupDir = path.join(process.cwd(), 'backups');
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `dev-${dateStr}.sqlite`);

        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(dbPath, backupPath);

        return NextResponse.json({ success: true, message: "Backup is succesvol vastgelegd", file: backupPath });
    } catch (e: any) {
        return NextResponse.json({ error: "Mislukt om database te back-uppen", details: e.message }, { status: 500 });
    }
}

