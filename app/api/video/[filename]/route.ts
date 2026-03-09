import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ filename: string }> }) {
    const params = await props.params;
    const filename = path.basename(params.filename); // security: strip path traversal
    const videosDir = path.join(process.cwd(), 'public', 'videos');
    const filePath = path.join(videosDir, filename);

    // Path traversal check
    if (!filePath.startsWith(videosDir)) {
        return NextResponse.json({ error: "Ongeldig pad" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.get('range');

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, fileSize - 1);
        const chunkSize = end - start + 1;

        const nodeStream = fs.createReadStream(filePath, { start, end });
        const webStream = new ReadableStream({
            start(controller) {
                nodeStream.on('data', (chunk: any) => {
                    try {
                        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
                    } catch (e) {
                        nodeStream.destroy();
                    }
                });
                nodeStream.on('end', () => {
                    try { controller.close(); } catch (e) { }
                });
                nodeStream.on('error', (err) => {
                    try { controller.error(err); } catch (e) { }
                });
            },
            cancel() {
                nodeStream.destroy();
            }
        });

        return new Response(webStream, {
            status: 206,
            headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(chunkSize),
                'Content-Disposition': 'inline',
                'Content-Type': 'video/mp4',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
        });
    }

    // Full file: also stream instead of readFileSync
    const nodeStream = fs.createReadStream(filePath);
    const webStream = new ReadableStream({
        start(controller) {
            nodeStream.on('data', (chunk: any) => {
                try {
                    controller.enqueue(new Uint8Array(Buffer.from(chunk)));
                } catch (e) {
                    nodeStream.destroy();
                }
            });
            nodeStream.on('end', () => {
                try { controller.close(); } catch (e) { }
            });
            nodeStream.on('error', (err) => {
                try { controller.error(err); } catch (e) { }
            });
        },
        cancel() {
            nodeStream.destroy();
        }
    });

    return new Response(webStream, {
        status: 200,
        headers: {
            'Content-Length': String(fileSize),
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Disposition': 'inline',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
