import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    '@geo-lens/core-geo',
    '@geo-lens/geocube',
    'resium',
    'cesium',
    'react-map-gl',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/geo-layers',
    '@deck.gl/mapbox'
  ],
};

export default nextConfig;
