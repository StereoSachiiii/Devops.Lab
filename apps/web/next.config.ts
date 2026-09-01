import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "path";

// Load the centralized .env file from the repo root
config({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env["NEXT_PUBLIC_API_BASE_URL"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /node_modules/,
      };
    }
    return config;
  },
};

export default nextConfig;
