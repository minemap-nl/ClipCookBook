import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/** Windows reserved device names; path.join can still target them with basename-only segments. */
const WIN_RESERVED_BASE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function isSafeVideoBasename(name: string): boolean {
    if (!name || name === '.' || name === '..') return false;
    if (name.includes('/') || name.includes('\\') || name.includes(':')) return false;
    if (WIN_RESERVED_BASE.test(name)) return false;
    return true;
}

/** True if resolved file path is inside resolved dir (no traversal, no Windows oddities). */
function isResolvedPathInsideDir(filePath: string, dirPath: string): boolean {
    const dir = path.resolve(dirPath);
    const file = path.resolve(filePath);
    const rel = path.relative(dir, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    return true;
}

export async function GET(req: Request, props: { params: Promise<{ filename: string }> }) {
    const params = await props.params;
    const filename = path.basename(params.filename);
    if (!isSafeVideoBasename(filename)) {
        return NextResponse.json({ error: "Ongeldig pad" }, { status: 400 });
    }

    const videosDir = path.resolve(process.cwd(), 'public', 'videos');
    let filePath = path.resolve(videosDir, filename);

    if (!isResolvedPathInsideDir(filePath, videosDir)) {
        return NextResponse.json({ error: "Ongeldig pad" }, { status: 400 });
    }

    // If filename has no extension, try with .mp4
    if (!fs.existsSync(filePath) && !filename.includes('.')) {
        const withMp4 = path.resolve(videosDir, `${filename}.mp4`);
        if (!isResolvedPathInsideDir(withMp4, videosDir)) {
            return NextResponse.json({ error: "Ongeldig pad" }, { status: 400 });
        }
        filePath = withMp4;
    }

    if (!isResolvedPathInsideDir(filePath, videosDir)) {
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
                'Content-Type': 'video/mp4',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': 'inline',
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
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
