import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('file') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: "Geen bestanden geselecteerd" }, { status: 400 });
        }

        const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');
        const videosDir = path.join(process.cwd(), 'public', 'videos');

        if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        const savedUrls: string[] = [];

        for (const file of files) {
            const ext = path.extname(file.name) || (file.type.startsWith('video/') ? '.mp4' : '.jpg');
            const id = crypto.randomUUID();
            const fileName = `${id}${ext}`;

            const isVideo = file.type.startsWith('video/') || fileName.match(/\.(mp4|mov|webm)$/i);

            const targetDir = isVideo ? videosDir : thumbsDir;
            const filePath = path.join(targetDir, fileName);

            const buffer = Buffer.from(await file.arrayBuffer());
            fs.writeFileSync(filePath, buffer);

            const apiUrl = isVideo ? `/api/video/${fileName}` : `/api/thumbnail/${fileName}`;
            savedUrls.push(apiUrl);
        }

        return NextResponse.json({ success: true, urls: savedUrls });

    } catch (error: any) {
        console.error("Media upload error:", error);
        return NextResponse.json({ error: "Fout bij uploaden van media", details: error.message }, { status: 500 });
    }
}
