import type { NextConfig } from "next";

// /api/* is handled by src/app/api/[...path]/route.ts, a runtime proxy to
// PS3_API_ORIGIN -- not next.config rewrites (see that file for why).
const nextConfig: NextConfig = {};

export default nextConfig;
