# ClipCookBook — changes since v1.06 → v1.15

Comparison against [release v1.06](https://github.com/minemap-nl/ClipCookBook/releases/tag/v1.06).

## Highlights vs v1.06

| Area | v1.06 | v1.15 |
|------|-------|-------|
| Gemini model | Older flash (implicit) | Default `gemini-3.5-flash` (`GEMINI_MODEL`) |
| AI failures | Could silently fall back to heuristic parser | Strict AI when `PROCESS_METHOD=ai` |
| Deep Search | Could abort on empty caption (“filtered”) before video AI | Skips text AI / goes to video AI when Deep Search or short caption |
| Instagram video | Often blocked without login | Optional cookies + `/cookies` UI + Playwright helper |
| yt-dlp | Static binary from image build | Nightly auto-update (`YT_DLP_*`) |
| Ops alerts | Backup-oriented | + cookie expiry alerts via `SMTP_ALERT_TO` |
| Docker entrypoint | Data/media chown | Also `backups` (fixes EACCES on auto-backup) |
| Stack | Next ~16.2.6 era | Next 16.2.12, Prisma 7.9, GenAI SDK 2.x, better-sqlite3 12.11 |

## New capabilities

- Instagram public-meta fallback (caption without video when yt-dlp is blocked)
- Secure cookie upload API (`/api/admin/ytdlp-cookies`)
- Local cookie refresh tool (`tools/instagram-cookies`)
- Media recovery + orphan cleanup cron (existing path hardened with cookies)
- Webpack default for Windows `npm run dev` (Turbopack junction workaround)
