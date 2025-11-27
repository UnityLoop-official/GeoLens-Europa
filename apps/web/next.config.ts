import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    '@geo-lens/core-geo',
    '@geo-lens/geocube',
    'resium',
    'cesium'
  ],
};

export default nextConfig;
