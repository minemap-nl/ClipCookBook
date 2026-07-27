#!/bin/sh
set -e

echo "=== Fixing permissions on mounted volumes ==="
mkdir -p /app/data /app/public/videos /app/public/thumbnails /app/backups
# nextjs (uid 1001) must write DB, media, and backup copies
chown -R nextjs:nodejs /app/data /app/public/videos /app/public/thumbnails /app/backups 2>/dev/null || true
chmod -R u+rwX /app/data /app/public/videos /app/public/thumbnails /app/backups 2>/dev/null || true

echo "=== yt-dlp update (startup, optional) ==="
# Default: skip on start (nightly cron in the app is enough). Set YT_DLP_AUTO_UPDATE_ON_STARTUP=true to enable.
if [ "${YT_DLP_AUTO_UPDATE:-true}" != "false" ] && [ "${YT_DLP_AUTO_UPDATE_ON_STARTUP:-false}" = "true" ]; then
  YTDLP_BIN="/app/node_modules/yt-dlp-exec/bin/yt-dlp"
  if [ -x "$YTDLP_BIN" ]; then
    echo "Checking for yt-dlp updates..."
    "$YTDLP_BIN" -U 2>/dev/null || su-exec nextjs node /app/node_modules/yt-dlp-exec/scripts/postinstall.js 2>/dev/null || true
    "$YTDLP_BIN" --version 2>/dev/null || true
  else
    echo "yt-dlp binary not found at $YTDLP_BIN"
  fi
else
  echo "Startup yt-dlp update skipped (enable with YT_DLP_AUTO_UPDATE_ON_STARTUP=true)"
fi

echo "=== Database Setup ==="
echo "DATABASE_URL: $DATABASE_URL"
echo "Schema: /app/prisma/schema.prisma"

# Show DB file size so empty/missing mounts are obvious in logs
if [ -f /app/data/dev.db ]; then
  ls -lah /app/data/dev.db /app/data/dev.db-* 2>/dev/null || ls -lah /app/data/dev.db
else
  echo "WARNING: /app/data/dev.db not found — a new empty database will be created."
fi

su-exec nextjs node /app/node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --accept-data-loss

echo "=== Starting Server ==="
exec su-exec nextjs node server.js
