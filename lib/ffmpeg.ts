import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';

export const extractFrames = async (videoPath: string, outputDir: string, baseThumbnailName: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const absoluteOutputDir = path.join(process.cwd(), outputDir);
        const generatedFiles: string[] = [];

        ffmpeg(videoPath)
            .on('end', () => {
                const paths = generatedFiles.map(file => `/api/thumbnail/${file}`);
                resolve(paths);
            })
            .on('error', (err) => {
                console.error('Error generating thumbnails:', err);
                resolve([]); // Resolve with empty array on error to not break the extraction pipeline completely
            })
            .on('filenames', (filenames) => {
                generatedFiles.push(...filenames);
            })
            .screenshots({
                timestamps: ['3%', '10%', '97%'],
                folder: absoluteOutputDir,
                filename: `${baseThumbnailName}-%i.jpg`,
                size: '?x720', // Fix height, keep aspect ratio
            });
    });
};
