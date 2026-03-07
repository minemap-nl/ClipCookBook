import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ["yt-dlp-exec", "better-sqlite3", "@prisma/adapter-better-sqlite3", "jsdom", "dompurify"],
};

export default nextConfig;
