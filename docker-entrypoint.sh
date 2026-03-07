#!/bin/sh
set -e

echo "=== Fixing permissions on mounted volumes ==="
chown -R nextjs:nodejs /app/data /app/public/videos /app/public/thumbnails 2>/dev/null || true

echo "=== Database Setup ==="
echo "DATABASE_URL: $DATABASE_URL"
echo "Schema: /app/prisma/schema.prisma"

su-exec nextjs node /app/node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --accept-data-loss

echo "=== Starting Server ==="
exec su-exec nextjs node server.js
