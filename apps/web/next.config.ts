import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    '@geo-lens/core-geo',
    '@geo-lens/geocube',
    'resium',
    'cesium',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/geo-layers',
    '@deck.gl/react',
    'react-map-gl',
    'maplibre-gl'
  ],
};

export default nextConfig;
