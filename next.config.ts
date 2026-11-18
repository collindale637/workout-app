import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Short build id, attached to notes sent from the More tab so a bug report says which version it came from.
  env: { NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7) },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/yuhonas/free-exercise-db/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; connect-src 'self' https:; img-src 'self' https: data:" },
        ],
      },
    ];
  },
};

export default nextConfig;
