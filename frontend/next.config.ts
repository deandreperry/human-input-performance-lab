import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.HIP_NEXT_DIST ?? ".next",
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          (process.env.HIP_API_ORIGIN ?? "http://127.0.0.1:8000") +
          "/api/:path*",
      },
    ];
  },
};
export default config;
