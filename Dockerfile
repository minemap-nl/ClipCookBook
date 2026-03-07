FROM node:20-alpine AS base

# Install OS-level dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app

# Copy dependency graphs and install with bun
COPY package.json bun.lock* ./
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN bun install

# Ensure better-sqlite3 native binding is compiled at the standard path
RUN npm rebuild better-sqlite3

# Rebuild the source code
FROM base AS builder
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
COPY --from=oven/bun:1-alpine /usr/local/bin/bunx /usr/local/bin/bunx
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
ENV DATABASE_URL="file:./dev.db"
RUN bunx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Isolated stage: install runtime node_modules in a clean environment
# Includes prisma CLI (for db push), adapter, dotenv, and serverExternalPackages
FROM base AS runtime-deps
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
RUN apk add --no-cache openssl python3
WORKDIR /runtime-deps
COPY package.json ./
# Use bun to quickly install runtime dependencies
RUN bun add prisma@7 @prisma/client@7 @prisma/adapter-better-sqlite3@7 dotenv yt-dlp-exec@1 jsdom dompurify --no-save && \
    node node_modules/@prisma/engines/dist/scripts/postinstall.js

# Production runtime image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies required for yt-dlp
RUN apk add --no-cache python3 ffmpeg openssl su-exec

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create writable directories
RUN mkdir -p .next public/videos public/thumbnails data
RUN chown -R nextjs:nodejs .next public/videos public/thumbnails data

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy generated Prisma client (new v7 output path)
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated

# Copy all runtime node_modules from the isolated runtime-deps stage
# This includes prisma, @prisma/*, valibot, dotenv, yt-dlp-exec, execa, etc.
COPY --from=runtime-deps --chown=nextjs:nodejs /runtime-deps/node_modules ./node_modules

# Copy better-sqlite3 native bindings (compiled in deps stage with correct arch)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Copy prisma schema + config
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Copy entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Final ownership
RUN chown -R nextjs:nodejs public/videos public/thumbnails data

# Entrypoint runs as root to fix volume permissions, then drops to nextjs via su-exec

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
