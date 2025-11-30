/**
 * ESHM20 Provider - European Seismic Hazard Model 2020
 *
 * Data Source: ESHM20 - European Seismic Hazard Model 2020
 * Provider: EFEHR (European Facilities for Earthquake Hazard & Risk)
 * Format: GeoTIFF / ASCII Grid
 * Coverage: Europe + Mediterranean (25°N - 72°N, 25°W - 50°E)
 * Resolution: 0.1° (~10km)
 * Parameter: PGA (Peak Ground Acceleration) for 475-year return period
 *
 * Download: http://hazard.efehr.org/en/Downloads/seismic-hazard-maps/
 * Direct Data: http://hazard.efehr.org/export/sites/hazard/.galleries/maps/ESHM20_PGA_475.tif
 *
 * Units: m/s² (convert to g by dividing by 9.81)
 *
 * Citation: Danciu et al. (2021). The 2020 update of the European Seismic Hazard Model
 */

import { BaseGeoProvider, GeoPoint, GeoData, BoundingBox, ProviderMetadata } from './base';
import { fromUrl, fromFile } from 'geotiff';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export class ESHM20Provider extends BaseGeoProvider {
    private static readonly ESHM20_URL = 'http://hazard.efehr.org/export/sites/hazard/.galleries/maps/ESHM20_PGA_475.tif';
    private static readonly LOCAL_PATH = path.join(process.cwd(), 'data', 'raw', 'ESHM20_PGA_475.tif');

    private tiff: any = null;
    private image: any = null;
    private isLoaded = false;

    constructor() {
        super({
            cacheEnabled: true,
            cacheTTL: 86400 * 365, // 1 year (static dataset)
            retryAttempts: 3,
            retryDelay: 2000,
            timeout: 60000
        });
    }

    getMetadata(): ProviderMetadata {
        return {
            name: 'ESHM20',
            source: 'EFEHR - European Facilities for Earthquake Hazard & Risk',
            resolution: '0.1° (~10km)',
            updateFrequency: 'static',
            coverage: 'europe + mediterranean',
            latency: 'static'
        };
    }

    hasCoverage(point: GeoPoint): boolean {
        // Europe + Mediterranean coverage
        return (
            point.lat >= 25 &&
            point.lat <= 72 &&
            point.lon >= -25 &&
            point.lon <= 50
        );
    }

    async getLatestTimestamp(): Promise<string> {
        return '2020-01-01T00:00:00Z'; // ESHM20 publication year
    }

    /**
     * Download ESHM20 GeoTIFF if not already cached locally
     */
    private async ensureDataset(): Promise<void> {
        if (fs.existsSync(ESHM20Provider.LOCAL_PATH)) {
            console.log(`[ESHM20] Using cached dataset: ${ESHM20Provider.LOCAL_PATH}`);
            return;
        }

        const dataDir = path.dirname(ESHM20Provider.LOCAL_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log(`[ESHM20] Downloading dataset from ${ESHM20Provider.ESHM20_URL}`);

        try {
            const response = await axios({
                method: 'GET',
                url: ESHM20Provider.ESHM20_URL,
                responseType: 'stream',
                timeout: this.config.timeout,
                maxRedirects: 5
            });

            const writer = fs.createWriteStream(ESHM20Provider.LOCAL_PATH);
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            console.log(`[ESHM20] Dataset downloaded successfully`);
        } catch (error) {
            console.error('[ESHM20] Failed to download dataset:', error);
            throw new Error('Failed to download ESHM20 dataset');
        }
    }

    /**
     * Load ESHM20 GeoTIFF into memory
     */
    private async loadDataset(): Promise<void> {
        if (this.isLoaded) return;

        await this.ensureDataset();

        console.log('[ESHM20] Loading GeoTIFF into memory...');

        try {
            if (fs.existsSync(ESHM20Provider.LOCAL_PATH)) {
                this.tiff = await fromFile(ESHM20Provider.LOCAL_PATH);
            } else {
                this.tiff = await fromUrl(ESHM20Provider.ESHM20_URL);
            }

            this.image = await this.tiff.getImage();
            this.isLoaded = true;

            console.log('[ESHM20] Dataset loaded successfully');
            console.log(`[ESHM20] Image dimensions: ${this.image.getWidth()} x ${this.image.getHeight()}`);
        } catch (error) {
            console.error('[ESHM20] Failed to load dataset:', error);
            throw error;
        }
    }

    /**
     * Sample PGA (Peak Ground Acceleration) at specific coordinate
     * Returns value in g (gravity units)
     */
    private async samplePGA(lat: number, lon: number): Promise<number | null> {
        await this.loadDataset();

        try {
            const bbox = this.image.getBoundingBox();
            const width = this.image.getWidth();
            const height = this.image.getHeight();

            // Calculate pixel coordinates
            const x = Math.floor(((lon - bbox[0]) / (bbox[2] - bbox[0])) * width);
            const y = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);

            // Bounds check
            if (x < 0 || x >= width || y < 0 || y >= height) {
                return null;
            }

            // Read pixel window (1x1)
            const window = [x, y, x + 1, y + 1];
            const data = await this.image.readRasters({ window });

            // PGA value in m/s²
            let pga = data[0][0];

            // Handle nodata values
            if (pga < 0 || pga > 10) {
                return null;
            }

            // Convert m/s² to g (gravity units)
            pga = pga / 9.81;

            return pga;
        } catch (error) {
            console.error(`[ESHM20] Error sampling PGA at ${lat}, ${lon}:`, error);
            return null;
        }
    }

    async fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null> {
        if (!this.hasCoverage(point)) {
            return null;
        }

        return this.withRetry(async () => {
            const pga = await this.samplePGA(point.lat, point.lon);

            if (pga === null) {
                return null;
            }

            const ts = timestamp || await this.getLatestTimestamp();

            return {
                value: pga,
                lat: point.lat,
                lon: point.lon,
                timestamp: ts,
                source: this.metadata.source,
                quality: 0.90, // High quality scientific model
                unit: 'g'
            };
        }, `fetchPoint(${point.lat}, ${point.lon})`);
    }

    async fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>> {
        const results = new Map<string, GeoData>();
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset();

        await Promise.all(
            points.map(async (point) => {
                if (!this.hasCoverage(point)) return;

                try {
                    const pga = await this.samplePGA(point.lat, point.lon);

                    if (pga !== null) {
                        const key = `${point.lat}_${point.lon}`;
                        results.set(key, {
                            value: pga,
                            lat: point.lat,
                            lon: point.lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.90,
                            unit: 'g'
                        });
                    }
                } catch (error) {
                    console.warn(`[ESHM20] Failed to fetch point ${point.lat}, ${point.lon}:`, error);
                }
            })
        );

        console.log(`[ESHM20] Fetched ${results.size} data points for ${points.length} locations`);
        return results;
    }

    async fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]> {
        const results: GeoData[] = [];
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset();

        for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += resolution) {
            for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += resolution) {
                if (!this.hasCoverage({ lat, lon })) continue;

                try {
                    const pga = await this.samplePGA(lat, lon);

                    if (pga !== null) {
                        results.push({
                            value: pga,
                            lat,
                            lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.90,
                            unit: 'g'
                        });
                    }
                } catch (error) {
                    // Continue on error
                }
            }
        }

        return results;
    }

    /**
     * Get hazard level description from PGA value
     */
    static getHazardLevel(pga: number): string {
        if (pga < 0.05) return 'Very Low';
        if (pga < 0.10) return 'Low';
        if (pga < 0.20) return 'Moderate';
        if (pga < 0.40) return 'High';
        return 'Very High';
    }
}
