import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      {
        source: "/validate-sandbox/:path*",
        destination: "http://localhost:8090/validate/:path*",
      },
    ];
  },
};

export default nextConfig;
