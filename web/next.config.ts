import type { NextConfig } from "next";

const API_ORIGIN = process.env.PS3_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  // Rail files are ~10,000 rows x 129 float columns (~15MB as CSV); the
  // default 10MB proxy body cap truncates the upload before it reaches FastAPI.
  experimental: {
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
