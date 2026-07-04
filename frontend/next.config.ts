import type { NextConfig } from "next";

// Internal URL of the NestJS API. In Docker Compose this is the service name
// (`http://api:3000`); for local dev outside Docker it falls back to localhost.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  // Minimal server bundle for a small runtime Docker image.
  output: "standalone",
  // Pin the workspace root to this app (the repo also has a backend lockfile).
  turbopack: { root: import.meta.dirname },
  // Same-origin proxy: the browser only ever calls `/api/*` on the Next server,
  // which rewrites server-side to the API. No CORS, no backend changes.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
