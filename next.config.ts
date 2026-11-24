import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  redirects() {
    return [
      { source: "/", has: [{ type: "host", value: "www\\.belleezaa\\.com" }], destination: "/inicio", permanent: false },
      { source: "/", has: [{ type: "host", value: "belleezaa\\.com" }], destination: "/inicio", permanent: false },
      { source: "/", destination: "/inventario/panel", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "22mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
