import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      {
        source: "/healthz",
        destination: "http://localhost:8000/healthz",
      },
    ];
  },
};

export default nextConfig;
