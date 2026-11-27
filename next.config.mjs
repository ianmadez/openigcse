import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A second build folder lets a production build run beside `pnpm dev` (NEXT_DIST_DIR=.next-prod).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the tracing root so an unrelated lockfile in a parent folder is ignored.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Photos of handwritten working and evidence can be up to 15 MB (the bucket's limit).
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};

export default nextConfig;
