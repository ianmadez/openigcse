import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root so an unrelated lockfile in a parent folder is ignored.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Photos of handwritten working and evidence can be up to 15 MB (the bucket's limit).
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};

export default nextConfig;
