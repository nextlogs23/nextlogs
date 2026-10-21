import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  // A single build worker avoids Windows directory-creation races in nested
  // App Router output while remaining fully portable on Vercel.
  experimental: { cpus: 1, optimizePackageImports: ["lucide-react"] },
};

export default nextConfig;
