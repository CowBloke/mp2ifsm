import type { NextConfig } from "next";

const config: NextConfig = {
  // Served behind nginx on the Pi, which terminates the tunnel connection.
  poweredByHeader: false,
  // Garde les diagnostics visibles sans les superposer au dock de navigation.
  devIndicators: { position: "top-right" },
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  // Module natif : laissé à Node, jamais bundlé par Turbopack.
  serverExternalPackages: ["better-sqlite3"],
  reactStrictMode: true,
  experimental: {
    // Money pages must never be served from a stale cache.
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default config;
