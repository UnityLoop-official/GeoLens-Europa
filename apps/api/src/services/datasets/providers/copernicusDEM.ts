/**
 * Copernicus DEM Provider - Real elevation data from AWS S3
 *
 * Data Source: Copernicus DEM GLO-30 (30m resolution)
 * Storage: AWS S3 - s3://copernicus-dem-30m (public, no auth required)
 * Format: GeoTIFF tiles
 * Coverage: Global (-180 to 180, -90 to 90)
 * Resolution: 1 arcsecond (~30m at equator)
 * Tile Grid: 1° x 1° tiles
 *
 * Tile naming: Copernicus_DSM_COG_10_N45_00_E011_00_DEM.tif
 * Format: N{lat}_00_E{lon}_00 or N{lat}_00_W{lon}_00 or S{lat}_00_E{lon}_00 or S{lat}_00_W{lon}_00
 *
 * Documentation: https://registry.opendata.aws/copernicus-dem/
 */

import { BaseGeoProvider, GeoPoint, GeoData, BoundingBox, ProviderMetadata } from './base';
import axios from 'axios';
import { fromUrl } from 'geotiff';

interface DEMTile {
    url: string;
    bounds: {
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
    };
}

export class CopernicusDEMProvider extends BaseGeoProvider {
    private static readonly S3_BASE_URL = 'https://copernicus-dem-30m.s3.amazonaws.com';
    private static readonly TILE_SIZE = 1; // 1 degree tiles
    private tileCache: Map<string, any> = new Map(); // Cache for loaded GeoTIFF tiles

    constructor() {
        super({
            cacheEnabled: true,
            cacheTTL: 86400 * 30, // 30 days (DEM is static)
            retryAttempts: 3,
            retryDelay: 1000,
            timeout: 30000
        });
    }

    getMetadata(): ProviderMetadata {
        return {
            name: 'Copernicus-DEM-GLO30',
            source: 'ESA Copernicus / AWS Open Data',
            resolution: '30m (1 arcsec)',
            updateFrequency: 'static',
            coverage: 'global',
            latency: 'static'
        };
    }

    hasCoverage(point: GeoPoint): boolean {
        // Global coverage except for extreme polar regions
        return point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
    }

    async getLatestTimestamp(): Promise<string> {
        return '2021-01-01T00:00:00Z'; // DEM baseline timestamp (Copernicus DEM released 2021)
    }

    /**
     * Generate S3 URL for a DEM tile covering the given coordinate
     */
    private getTileURL(lat: number, lon: number): string {
        // Calculate tile bounds (floor to integer degree)
        const tileLat = Math.floor(lat);
        const tileLon = Math.floor(lon);

        // Determine hemisphere indicators
        const latHemi = tileLat >= 0 ? 'N' : 'S';
        const lonHemi = tileLon >= 0 ? 'E' : 'W';

        // Format coordinates with leading zeros (2 digits for lat, 3 for lon)
        const latStr = Math.abs(tileLat).toString().padStart(2, '0');
        const lonStr = Math.abs(tileLon).toString().padStart(3, '0');

        // Build tile name: Copernicus_DSM_COG_10_N45_00_E011_00_DEM.tif
        const tileName = `Copernicus_DSM_COG_10_${latHemi}${latStr}_00_${lonHemi}${lonStr}_00_DEM`;

        // S3 folder structure: /Copernicus_DSM_COG_10_N45_00_E011_00_DEM/Copernicus_DSM_COG_10_N45_00_E011_00_DEM.tif
        return `${CopernicusDEMProvider.S3_BASE_URL}/${tileName}/${tileName}.tif`;
    }

    /**
     * Load GeoTIFF tile from S3 (with caching)
     */
    private async loadTile(lat: number, lon: number): Promise<any> {
        const tileKey = `${Math.floor(lat)}_${Math.floor(lon)}`;

        if (this.tileCache.has(tileKey)) {
            return this.tileCache.get(tileKey);
        }

        const url = this.getTileURL(lat, lon);
        console.log(`[CopernicusDEM] Loading tile: ${url}`);

        try {
            const tiff = await fromUrl(url);
            const image = await tiff.getImage();

            // Cache tile (limit cache size to 100 tiles)
            if (this.tileCache.size >= 100) {
                const firstKey = this.tileCache.keys().next().value;
                if (firstKey !== undefined) {
                    this.tileCache.delete(firstKey);
                }
            }
            this.tileCache.set(tileKey, { tiff, image });

            return { tiff, image };
        } catch (error) {
            console.error(`[CopernicusDEM] Failed to load tile ${url}:`, error);
            throw error;
        }
    }

    /**
     * Sample elevation from GeoTIFF at specific coordinate
     */
    private async sampleElevation(lat: number, lon: number): Promise<number | null> {
        try {
            const { image } = await this.loadTile(lat, lon);

            // Get image dimensions and bounds
            const bbox = image.getBoundingBox();
            const width = image.getWidth();
            const height = image.getHeight();

            // Calculate pixel coordinates
            const x = Math.floor(((lon - bbox[0]) / (bbox[2] - bbox[0])) * width);
            const y = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);

            // Bounds check
            if (x < 0 || x >= width || y < 0 || y >= height) {
                console.warn(`[CopernicusDEM] Coordinates out of tile bounds: ${lat}, ${lon}`);
                return null;
            }

            // Read pixel window (1x1)
            const window = [x, y, x + 1, y + 1];
            const data = await image.readRasters({ window });

            // DEM data is typically in the first band
            const elevation = data[0][0];

            // Handle nodata values (typically -32768 or very large negative numbers)
            if (elevation < -1000 || elevation > 9000) {
                return null;
            }

            return elevation;
        } catch (error) {
            console.error(`[CopernicusDEM] Error sampling elevation at ${lat}, ${lon}:`, error);
            return null;
        }
    }

    /**
     * Calculate slope from elevation data using finite difference method
     * Returns slope in degrees
     */
    private async calculateSlope(lat: number, lon: number): Promise<number | null> {
        try {
            // Sample elevation at center point and 4 neighbors (N, S, E, W)
            const resolution = 0.0002778; // ~30m in degrees (1 arcsec)

            const elevCenter = await this.sampleElevation(lat, lon);
            const elevN = await this.sampleElevation(lat + resolution, lon);
            const elevS = await this.sampleElevation(lat - resolution, lon);
            const elevE = await this.sampleElevation(lat, lon + resolution);
            const elevW = await this.sampleElevation(lat, lon - resolution);

            if (elevCenter === null) return null;

            // Calculate gradients (dz/dx and dz/dy)
            const dzDx = ((elevE ?? elevCenter) - (elevW ?? elevCenter)) / (2 * resolution * 111320); // convert to meters
            const dzDy = ((elevN ?? elevCenter) - (elevS ?? elevCenter)) / (2 * resolution * 111320);

            // Calculate slope magnitude: sqrt(dzDx^2 + dzDy^2)
            const slopeMagnitude = Math.sqrt(dzDx * dzDx + dzDy * dzDy);

            // Convert to degrees: atan(magnitude) * 180/π
            const slopeDegrees = Math.atan(slopeMagnitude) * (180 / Math.PI);

            return slopeDegrees;
        } catch (error) {
            console.error(`[CopernicusDEM] Error calculating slope at ${lat}, ${lon}:`, error);
            return null;
        }
    }

    async fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null> {
        return this.withRetry(async () => {
            const elevation = await this.sampleElevation(point.lat, point.lon);

            if (elevation === null) {
                return null;
            }

            const ts = timestamp || await this.getLatestTimestamp();

            return {
                value: elevation,
                lat: point.lat,
                lon: point.lon,
                timestamp: ts,
                source: this.metadata.source,
                quality: 0.95, // High quality for Copernicus DEM
                unit: 'meters'
            };
        }, `fetchPoint(${point.lat}, ${point.lon})`);
    }

    async fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>> {
        const results = new Map<string, GeoData>();
        const ts = timestamp || await this.getLatestTimestamp();

        // Process in batches of 100 to avoid overwhelming memory
        const batchSize = 100;
        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);

            await Promise.all(
                batch.map(async (point) => {
                    try {
                        const elevation = await this.sampleElevation(point.lat, point.lon);
                        const slope = await this.calculateSlope(point.lat, point.lon);

                        if (elevation !== null) {
                            const key = `${point.lat}_${point.lon}`;
                            results.set(key, {
                                value: elevation,
                                lat: point.lat,
                                lon: point.lon,
                                timestamp: ts,
                                source: this.metadata.source,
                                quality: 0.95,
                                unit: 'meters'
                            });

                            // Also store slope if calculated
                            if (slope !== null) {
                                results.set(`${key}_slope`, {
                                    value: slope,
                                    lat: point.lat,
                                    lon: point.lon,
                                    timestamp: ts,
                                    source: this.metadata.source,
                                    quality: 0.90, // Slightly lower quality for derived data
                                    unit: 'degrees'
                                });
                            }
                        }
                    } catch (error) {
                        console.warn(`[CopernicusDEM] Failed to fetch point ${point.lat}, ${point.lon}:`, error);
                    }
                })
            );
        }

        console.log(`[CopernicusDEM] Fetched ${results.size} data points for ${points.length} locations`);
        return results;
    }

    async fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]> {
        const results: GeoData[] = [];
        const ts = timestamp || await this.getLatestTimestamp();

        // Generate sample points within bbox
        const latStep = resolution;
        const lonStep = resolution;

        for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += latStep) {
            for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += lonStep) {
                try {
                    const elevation = await this.sampleElevation(lat, lon);

                    if (elevation !== null) {
                        results.push({
                            value: elevation,
                            lat,
                            lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.95,
                            unit: 'meters'
                        });
                    }
                } catch (error) {
                    // Continue on error
                }
            }
        }

        return results;
    }
}
