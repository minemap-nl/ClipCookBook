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
                const { clearBackupFailureAlertFlag, maybeSendBackupFailureAlert } = await import(
                    './lib/backup-failure-alert'
                );
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
                    await clearBackupFailureAlertFlag();

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
                    const detail = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
                    console.error('[ERROR] [Cron] Auto backup failed:', e);
                    await maybeSendBackupFailureAlert(detail);
                }
            };

            // Run every 24 hours
            setInterval(doBackup, 24 * 60 * 60 * 1000);
            setTimeout(doBackup, 10000); // initial run after 10s
        } else {
            console.log('[Cron] Auto backups are disabled. Set AUTO_BACKUP=true to enable.');
        }

        const runMediaRecovery = async () => {
            if (process.env.MEDIA_RECOVERY === 'false') {
                console.log('[Cron] Media recovery is disabled (MEDIA_RECOVERY=false).');
                return;
            }
            try {
                const { runMissingMediaRecovery, maybeSendMissingMediaAlert } = await import('./lib/media-recovery');
                const r = await runMissingMediaRecovery();
                console.log(
                    `[Cron] Media recovery: restored ${r.recovered}, still missing ${r.stillMissing.length}`
                );
                await maybeSendMissingMediaAlert(r);
            } catch (e) {
                console.error('[Cron] Media recovery failed:', e);
            }
        };

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

                // DB stores video URLs as /api/v/<uuid> (no extension); files on disk are <uuid>.mp4.
                // path.basename of the URL is only the uuid, so we must also treat <uuid>.mp4 as in-use.
                const isStillReferenced = (file: string, matchStem: boolean) => {
                    if (activeFiles.has(file)) return true;
                    if (matchStem) {
                        const stem = path.parse(file).name;
                        if (stem && activeFiles.has(stem)) return true;
                    }
                    return false;
                };

                const dirsToClean: { dir: string; matchStem: boolean }[] = [
                    { dir: path.join(process.cwd(), 'public', 'videos'), matchStem: true },
                    { dir: path.join(process.cwd(), 'public', 'thumbnails'), matchStem: false }
                ];

                let deletedCount = 0;
                const now = Date.now();
                // 24 hours grace period to ensure we don't delete files currently mid-upload / draft
                const MAX_AGE_MS = 24 * 60 * 60 * 1000;

                for (const { dir, matchStem } of dirsToClean) {
                    try {
                        const files = await fs.readdir(dir);
                        for (const file of files) {
                            if (file === '.placeholder' || file === '.gitkeep') continue;

                            if (!isStillReferenced(file, matchStem)) {
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

        const mediaMaintenance = async () => {
            await runMediaRecovery();
            await cleanOrphanedMedia();
        };

        const maintenanceInitialMs = Math.max(
            10_000,
            parseInt(process.env.MEDIA_MAINTENANCE_INITIAL_DELAY_MS || '120000', 10) || 120_000
        );

        // Every 24 hours: yt-dlp media recovery, then orphan cleanup
        setInterval(mediaMaintenance, 24 * 60 * 60 * 1000);
        setTimeout(mediaMaintenance, maintenanceInitialMs);
        console.log(
            `[Cron] Media maintenance (recovery + orphan cleanup) first run in ${Math.round(maintenanceInitialMs / 1000)}s, then every 24h.`
        );
    }
}
