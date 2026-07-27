# Instagram cookie helper (local)

Opens a clean Chromium window, lets you log into Instagram, exports Netscape `cookies.txt`, and uploads it to your ClipCookBook instance.

## Setup (once)

```bash
cd tools/instagram-cookies
bun install
bunx playwright install chromium
```

## Refresh + auto-import

```bash
bun run refresh -- --url https://recepten.yourdomain.com --password "YOUR_SITE_PASSWORD"
```

Or with env vars:

```bash
set APP_URL=https://recepten.yourdomain.com
set SITE_PASSWORD=your-secret
bun run refresh
```

Flags:

- `--out path` — also write a local cookies.txt (default: `./cookies.txt`)
- `--no-upload` — only save locally (then upload via the `/cookies` page)

## Security

- Upload uses `SITE_PASSWORD` (Bearer) or works from home/LAN without password if the proxy allows it.
- Prefer a dedicated Instagram account for scraping.
- Do not commit `cookies.txt`.
