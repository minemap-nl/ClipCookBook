import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ filename: string }> }) {
    const params = await props.params;
    const filename = path.basename(params.filename); // security: strip path traversal
    const thumbsDir = path.join(process.cwd(), 'public', 'thumbnails');
    const filePath = path.join(thumbsDir, filename);

    // Path traversal check
    if (!filePath.startsWith(thumbsDir)) {
        return NextResponse.json({ error: "Ongeldig pad" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Thumbnail niet gevonden" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    return new Response(buffer, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
