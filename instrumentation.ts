let cronStarted = false;

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && !cronStarted) {
        cronStarted = true;

        // Dynamically import node modules so Edge runtime doesn't complain
        const fs = await import('fs/promises');
        const path = await import('path');

        const autoBackup = process.env.AUTO_BACKUP === 'true';
        if (autoBackup) {
            console.log('[Cron] Auto backups are ENABLED. Running every 24 hours.');

            const doBackup = async () => {
                try {
                    const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
                    const strippedPath = dbUrl.replace(/^file:/, '');
                    const dbPath = path.resolve(process.cwd(), strippedPath);

                    const backupDir = path.join(process.cwd(), 'backups');
                    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupPath = path.join(backupDir, `dev-${dateStr}.sqlite`);

                    await fs.mkdir(backupDir, { recursive: true });
                    await fs.copyFile(dbPath, backupPath);

                    console.log(`[Cron] Auto backup completed successfully: ${backupPath}`);

                    // Keep only last 7 backups to prevent unlimited disk usage
                    const files = await fs.readdir(backupDir);
                    const sqliteFiles = files.filter(f => f.endsWith('.sqlite')).sort();
                    if (sqliteFiles.length > 7) {
                        const toDelete = sqliteFiles.slice(0, sqliteFiles.length - 7);
                        for (const f of toDelete) {
                            await fs.unlink(path.join(backupDir, f)).catch(() => { });
                        }
                    }
                } catch (e) {
                    console.error(`[Cron] Auto backup failed:`, e);
                }
            };

            // Run every 24 hours
            setInterval(doBackup, 24 * 60 * 60 * 1000);
            setTimeout(doBackup, 10000); // initial run after 10s
        } else {
            console.log('[Cron] Auto backups are disabled. Set AUTO_BACKUP=true to enable.');
        }

        // --- ORPHANED MEDIA CLEANUP CRON ---
        const cleanOrphanedMedia = async () => {
            try {
                console.log('[Cron] Starting cleanup of orphaned media...');
                // Fetch all database entries holding media file paths
                // Dynamically import the existing Prisma instance which uses the better-sqlite3 adapter
                const { prisma } = await import('./lib/prisma');

                const recipes = await prisma.recipe.findMany({
                    select: {
                        videoPath: true,
                        thumbnailPath: true,
                        originalThumbnail: true,
                        suggestedThumbnails: true,
                        media: true
                    }
                });

                const activeFiles = new Set<string>();

                const addFile = (p: string | null | undefined) => {
                    if (!p) return;
                    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return;
                    const filename = path.basename(p);
                    if (filename) activeFiles.add(filename);
                };

                for (const r of recipes) {
                    addFile(r.videoPath);
                    addFile(r.thumbnailPath);
                    addFile(r.originalThumbnail);

                    if (r.suggestedThumbnails) {
                        r.suggestedThumbnails.split(',').forEach((p: string) => addFile(p.trim()));
                    }
                    if (r.media) {
                        r.media.split(',').forEach((p: string) => addFile(p.trim()));
                    }
                }

                // Now we have a list of all legitimately used media filenames, scan directories for orphaned files
                const dirsToClean = [
                    path.join(process.cwd(), 'public', 'videos'),
                    path.join(process.cwd(), 'public', 'thumbnails')
                ];

                let deletedCount = 0;
                const now = Date.now();
                // 24 hours grace period to ensure we don't delete files currently mid-upload / draft
                const MAX_AGE_MS = 24 * 60 * 60 * 1000;

                for (const dir of dirsToClean) {
                    try {
                        const files = await fs.readdir(dir);
                        for (const file of files) {
                            if (file === '.placeholder' || file === '.gitkeep') continue;

                            if (!activeFiles.has(file)) {
                                const filePath = path.join(dir, file);
                                const stats = await fs.stat(filePath);

                                if (now - stats.mtimeMs > MAX_AGE_MS) {
                                    await fs.unlink(filePath);
                                    deletedCount++;
                                    console.log(`[Cron] Deleted orphaned media: ${filePath}`);
                                }
                            }
                        }
                    } catch (err: any) {
                        if (err.code !== 'ENOENT') {
                            console.error(`[Cron] Error reading media directory ${dir}:`, err);
                        }
                    }
                }

                console.log(`[Cron] Cleanup done. Deleted ${deletedCount} orphaned files.`);
            } catch (e) {
                console.error(`[Cron] Clean orphaned media failed:`, e);
            }
        };

        // Every 24 hours
        setInterval(cleanOrphanedMedia, 24 * 60 * 60 * 1000);
        setTimeout(cleanOrphanedMedia, 15000); // initial run after 15s
    }
}
