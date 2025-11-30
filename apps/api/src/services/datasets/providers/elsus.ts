/**
 * ELSUS Provider - European Landslide Susceptibility Map
 *
 * Data Source: ELSUS v2 - European Landslide Susceptibility Map
 * Provider: European Soil Data Centre (ESDAC) - JRC
 * Format: GeoTIFF
 * Coverage: Europe (approx 30°N - 72°N, 25°W - 45°E)
 * Resolution: 200m
 * Classification: 0-5 (0=no data, 1=very low, 2=low, 3=moderate, 4=high, 5=very high)
 *
 * Download: https://esdac.jrc.ec.europa.eu/content/european-landslide-susceptibility-map-elsus-v2
 * Direct GeoTIFF: https://esdac.jrc.ec.europa.eu/public_path/ELSUS_v2.tif
 *
 * Citation: Wilde et al. (2018). Pan-European landslide susceptibility mapping
 */

import { BaseGeoProvider, GeoPoint, GeoData, BoundingBox, ProviderMetadata } from './base';
import { fromUrl, fromFile } from 'geotiff';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export class ELSUSProvider extends BaseGeoProvider {
    private static readonly ELSUS_URL = 'https://esdac.jrc.ec.europa.eu/public_path/ELSUS_v2.tif';
    private static readonly LOCAL_PATH = path.join(process.cwd(), 'data', 'raw', 'ELSUS_v2.tif');

    private tiff: any = null;
    private image: any = null;
    private isLoaded = false;

    constructor() {
        super({
            cacheEnabled: true,
            cacheTTL: 86400 * 365, // 1 year (static dataset)
            retryAttempts: 3,
            retryDelay: 2000,
            timeout: 120000 // 2 minutes for large file download
        });
    }

    getMetadata(): ProviderMetadata {
        return {
            name: 'ELSUS-v2',
            source: 'European Soil Data Centre (ESDAC) - JRC',
            resolution: '200m',
            updateFrequency: 'static',
            coverage: 'europe',
            latency: 'static'
        };
    }

    hasCoverage(point: GeoPoint): boolean {
        // Europe coverage: approximately 30°N - 72°N, 25°W - 45°E
        return (
            point.lat >= 30 &&
            point.lat <= 72 &&
            point.lon >= -25 &&
            point.lon <= 45
        );
    }

    async getLatestTimestamp(): Promise<string> {
        return '2018-01-01T00:00:00Z'; // ELSUS v2 publication year
    }

    /**
     * Download ELSUS GeoTIFF if not already cached locally
     */
    private async ensureDataset(): Promise<void> {
        // Check if file exists locally
        if (fs.existsSync(ELSUSProvider.LOCAL_PATH)) {
            console.log(`[ELSUS] Using cached dataset: ${ELSUSProvider.LOCAL_PATH}`);
            return;
        }

        // Create data directory if needed
        const dataDir = path.dirname(ELSUSProvider.LOCAL_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log(`[ELSUS] Downloading dataset from ${ELSUSProvider.ELSUS_URL}`);
        console.log('[ELSUS] This is a large file (~500MB), download may take several minutes...');

        try {
            const response = await axios({
                method: 'GET',
                url: ELSUSProvider.ELSUS_URL,
                responseType: 'stream',
                timeout: this.config.timeout,
                maxRedirects: 5
            });

            const writer = fs.createWriteStream(ELSUSProvider.LOCAL_PATH);

            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            console.log(`[ELSUS] Dataset downloaded successfully: ${ELSUSProvider.LOCAL_PATH}`);
        } catch (error) {
            console.error('[ELSUS] Failed to download dataset:', error);
            throw new Error('Failed to download ELSUS dataset. Check network connection and URL.');
        }
    }

    /**
     * Load ELSUS GeoTIFF into memory
     */
    private async loadDataset(): Promise<void> {
        if (this.isLoaded) return;

        await this.ensureDataset();

        console.log('[ELSUS] Loading GeoTIFF into memory...');

        try {
            if (fs.existsSync(ELSUSProvider.LOCAL_PATH)) {
                // Load from local file
                this.tiff = await fromFile(ELSUSProvider.LOCAL_PATH);
            } else {
                // Load directly from URL (fallback)
                this.tiff = await fromUrl(ELSUSProvider.ELSUS_URL);
            }

            this.image = await this.tiff.getImage();
            this.isLoaded = true;

            console.log('[ELSUS] Dataset loaded successfully');
            console.log(`[ELSUS] Image dimensions: ${this.image.getWidth()} x ${this.image.getHeight()}`);
            console.log(`[ELSUS] Bounding box:`, this.image.getBoundingBox());
        } catch (error) {
            console.error('[ELSUS] Failed to load dataset:', error);
            throw error;
        }
    }

    /**
     * Sample ELSUS class at specific coordinate
     */
    private async sampleClass(lat: number, lon: number): Promise<number | null> {
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

            // ELSUS class (0-5)
            const elsusClass = data[0][0];

            // Validate class range
            if (elsusClass < 0 || elsusClass > 5) {
                return null;
            }

            return elsusClass;
        } catch (error) {
            console.error(`[ELSUS] Error sampling class at ${lat}, ${lon}:`, error);
            return null;
        }
    }

    async fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null> {
        if (!this.hasCoverage(point)) {
            return null;
        }

        return this.withRetry(async () => {
            const elsusClass = await this.sampleClass(point.lat, point.lon);

            if (elsusClass === null) {
                return null;
            }

            const ts = timestamp || await this.getLatestTimestamp();

            return {
                value: elsusClass,
                lat: point.lat,
                lon: point.lon,
                timestamp: ts,
                source: this.metadata.source,
                quality: 0.85, // High quality scientific dataset
                unit: 'class'
            };
        }, `fetchPoint(${point.lat}, ${point.lon})`);
    }

    async fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>> {
        const results = new Map<string, GeoData>();
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset(); // Load once for entire batch

        await Promise.all(
            points.map(async (point) => {
                if (!this.hasCoverage(point)) return;

                try {
                    const elsusClass = await this.sampleClass(point.lat, point.lon);

                    if (elsusClass !== null) {
                        const key = `${point.lat}_${point.lon}`;
                        results.set(key, {
                            value: elsusClass,
                            lat: point.lat,
                            lon: point.lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.85,
                            unit: 'class'
                        });
                    }
                } catch (error) {
                    console.warn(`[ELSUS] Failed to fetch point ${point.lat}, ${point.lon}:`, error);
                }
            })
        );

        console.log(`[ELSUS] Fetched ${results.size} data points for ${points.length} locations`);
        return results;
    }

    async fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]> {
        const results: GeoData[] = [];
        const ts = timestamp || await this.getLatestTimestamp();

        await this.loadDataset();

        // Sample at specified resolution
        for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += resolution) {
            for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += resolution) {
                if (!this.hasCoverage({ lat, lon })) continue;

                try {
                    const elsusClass = await this.sampleClass(lat, lon);

                    if (elsusClass !== null) {
                        results.push({
                            value: elsusClass,
                            lat,
                            lon,
                            timestamp: ts,
                            source: this.metadata.source,
                            quality: 0.85,
                            unit: 'class'
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
     * Get textual description of ELSUS class
     */
    static getClassDescription(elsusClass: number): string {
        const descriptions: Record<number, string> = {
            0: 'No Data',
            1: 'Very Low Susceptibility',
            2: 'Low Susceptibility',
            3: 'Moderate Susceptibility',
            4: 'High Susceptibility',
            5: 'Very High Susceptibility'
        };
        return descriptions[elsusClass] || 'Unknown';
    }
}
