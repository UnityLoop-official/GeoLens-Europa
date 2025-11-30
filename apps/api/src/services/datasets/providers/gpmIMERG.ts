/**
 * GPM IMERG Provider - Real-time precipitation data from NASA
 *
 * Data Source: GPM (Global Precipitation Measurement) IMERG
 * API: NASA GES DISC (Goddard Earth Sciences Data and Information Services Center)
 * Format: HDF5/NetCDF4
 * Coverage: Global (60°N - 60°S)
 * Resolution: 0.1° (~10km)
 * Temporal: 30-minute intervals
 * Latency: 4-6 hours (Early Run), 14-18 hours (Late Run), 3.5 months (Final Run)
 *
 * Products:
 * - IMERG Early: Real-time, 4-6h latency
 * - IMERG Late: Better quality, 14-18h latency
 * - IMERG Final: Research quality, 3.5 months latency
 *
 * For real-time operations, we use IMERG Early Run
 *
 * NASA Earthdata Login required: https://urs.earthdata.nasa.gov/
 * API Documentation: https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGHH_06/summary
 *
 * ALTERNATIVE: OpenDAP endpoint for easier access without file download
 * URL: https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHE.06/
 */

import { BaseGeoProvider, GeoPoint, GeoData, BoundingBox, ProviderMetadata } from './base';
import axios from 'axios';

interface IMERGConfig {
    username?: string;
    password?: string;
    product: 'early' | 'late' | 'final';
}

export class GPMIMERGProvider extends BaseGeoProvider {
    private static readonly OPENDAP_BASE = 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3';
    private static readonly PRODUCT_PATHS = {
        early: 'GPM_3IMERGHHE.06', // Half-hourly Early
        late: 'GPM_3IMERGHHL.06',  // Half-hourly Late
        final: 'GPM_3IMERGHH.06'   // Half-hourly Final
    };

    private username: string;
    private password: string;
    private product: 'early' | 'late' | 'final';
    private precipCache: Map<string, number[][]> = new Map();

    constructor(config: IMERGConfig = { product: 'early' }) {
        super({
            cacheEnabled: true,
            cacheTTL: 1800, // 30 minutes (matches IMERG update frequency)
            retryAttempts: 3,
            retryDelay: 2000,
            timeout: 60000
        });

        this.username = config.username || process.env.NASA_EARTHDATA_USERNAME || '';
        this.password = config.password || process.env.NASA_EARTHDATA_PASSWORD || '';
        this.product = config.product;

        if (!this.username || !this.password) {
            console.warn(
                '[GPM-IMERG] NASA Earthdata credentials not configured. ' +
                'Set NASA_EARTHDATA_USERNAME and NASA_EARTHDATA_PASSWORD environment variables. ' +
                'Register at: https://urs.earthdata.nasa.gov/'
            );
        }
    }

    getMetadata(): ProviderMetadata {
        const latencies = {
            early: '4-6h',
            late: '14-18h',
            final: '3.5 months'
        };

        return {
            name: 'GPM-IMERG',
            source: 'NASA GES DISC',
            resolution: '0.1° (~10km)',
            updateFrequency: '30min',
            coverage: 'global (60°N - 60°S)',
            latency: latencies[this.product]
        };
    }

    hasCoverage(point: GeoPoint): boolean {
        // IMERG covers 60°N to 60°S
        return point.lat >= -60 && point.lat <= 60 && point.lon >= -180 && point.lon <= 180;
    }

    async getLatestTimestamp(): Promise<string> {
        // Calculate latest available timestamp based on product latency
        const now = new Date();
        const latencyHours = this.product === 'early' ? 5 : this.product === 'late' ? 16 : 0;

        const latest = new Date(now.getTime() - latencyHours * 3600 * 1000);

        // Round down to nearest 30-minute interval
        latest.setMinutes(Math.floor(latest.getMinutes() / 30) * 30);
        latest.setSeconds(0);
        latest.setMilliseconds(0);

        return latest.toISOString();
    }

    /**
     * Generate OpenDAP URL for IMERG data at specific timestamp
     */
    private getOpenDAPURL(timestamp: Date): string {
        const year = timestamp.getUTCFullYear();
        const month = (timestamp.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = timestamp.getUTCDate().toString().padStart(2, '0');
        const hour = timestamp.getUTCHours().toString().padStart(2, '0');
        const minute = timestamp.getUTCMinutes().toString().padStart(2, '0');

        // Filename format: 3B-HHR-E.MS.MRG.3IMERG.20240315-S000000-E002959.0000.V06B.HDF5
        const productCode = this.product === 'early' ? 'E' : this.product === 'late' ? 'L' : 'F';
        const yyyymmdd = `${year}${month}${day}`;
        const startTime = `${hour}${minute}00`;

        // Calculate end time (30 minutes later)
        const endTimestamp = new Date(timestamp.getTime() + 30 * 60 * 1000);
        const endHour = endTimestamp.getUTCHours().toString().padStart(2, '0');
        const endMin = endTimestamp.getUTCMinutes().toString().padStart(2, '0');
        const endSec = (endTimestamp.getUTCSeconds() - 1).toString().padStart(2, '0'); // -1 second
        const endTime = `${endHour}${endMin}${endSec}`;

        const filename = `3B-HHR-${productCode}.MS.MRG.3IMERG.${yyyymmdd}-S${startTime}-E${endTime}.0000.V06B.HDF5`;
        const productPath = GPMIMERGProvider.PRODUCT_PATHS[this.product];

        return `${GPMIMERGProvider.OPENDAP_BASE}/${productPath}/${year}/${month}/${filename}`;
    }

    /**
     * Fetch precipitation data from OpenDAP endpoint
     * Returns 2D array of precipitation rates (mm/hr)
     */
    private async fetchPrecipitationGrid(timestamp: Date): Promise<number[][] | null> {
        const cacheKey = timestamp.toISOString();

        if (this.precipCache.has(cacheKey)) {
            return this.precipCache.get(cacheKey)!;
        }

        const url = this.getOpenDAPURL(timestamp);
        console.log(`[GPM-IMERG] Fetching from OpenDAP: ${url}`);

        try {
            // OpenDAP ASCII request for precipitation variable
            // Variable name: 'precipitationCal' (calibrated precipitation)
            const dataURL = `${url}.ascii?precipitationCal`;

            const response = await axios.get(dataURL, {
                auth: this.username && this.password ? {
                    username: this.username,
                    password: this.password
                } : undefined,
                timeout: this.config.timeout,
                headers: {
                    'User-Agent': 'GeoLens-EU/1.0'
                }
            });

            // Parse ASCII grid (simplified - in production use proper HDF5 parser)
            const grid = this.parseASCIIGrid(response.data);

            // Cache grid (limit to 10 most recent)
            if (this.precipCache.size >= 10) {
                const firstKey = this.precipCache.keys().next().value;
                if (firstKey !== undefined) {
                    this.precipCache.delete(firstKey);
                }
            }
            this.precipCache.set(cacheKey, grid);

            return grid;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    console.error('[GPM-IMERG] Authentication failed. Check NASA Earthdata credentials.');
                } else if (error.response?.status === 404) {
                    console.error(`[GPM-IMERG] Data not available for timestamp ${timestamp.toISOString()}`);
                } else {
                    console.error(`[GPM-IMERG] HTTP error ${error.response?.status}:`, error.message);
                }
            } else {
                console.error('[GPM-IMERG] Error fetching data:', error);
            }
            return null;
        }
    }

    /**
     * Parse OpenDAP ASCII grid response
     * Simplified parser - in production, use proper netCDF/HDF5 library
     */
    private parseASCIIGrid(asciiData: string): number[][] {
        // IMERG grid: 3600 x 1800 (0.1° resolution, global)
        // This is a placeholder - actual implementation needs proper HDF5/netCDF parsing
        // For now, return mock structure
        console.warn('[GPM-IMERG] Using mock parser - implement proper HDF5 parsing for production');

        // Mock 0.1° grid for Europe bbox
        const grid: number[][] = [];
        for (let i = 0; i < 1800; i++) {
            grid[i] = new Array(3600).fill(0);
        }
        return grid;
    }

    /**
     * Sample precipitation at specific lat/lon from grid
     */
    private samplePrecipitation(grid: number[][], lat: number, lon: number): number | null {
        // IMERG grid: 0.1° resolution
        // Latitude: -60 to 60 (1800 cells)
        // Longitude: -180 to 180 (3600 cells)

        const latIdx = Math.floor((60 - lat) / 0.1);
        const lonIdx = Math.floor((lon + 180) / 0.1);

        if (latIdx < 0 || latIdx >= 1800 || lonIdx < 0 || lonIdx >= 3600) {
            return null;
        }

        return grid[latIdx]?.[lonIdx] ?? null;
    }

    /**
     * Calculate precipitation accumulation over time window
     */
    private async calculateAccumulation(
        lat: number,
        lon: number,
        hoursBack: number,
        endTime?: Date
    ): Promise<number | null> {
        const end = endTime || new Date(await this.getLatestTimestamp());
        let totalPrecip = 0;
        let validSamples = 0;

        // Sample every 30 minutes back in time
        const intervals = Math.ceil(hoursBack * 2); // 2 intervals per hour

        for (let i = 0; i < intervals; i++) {
            const timestamp = new Date(end.getTime() - i * 30 * 60 * 1000);
            const grid = await this.fetchPrecipitationGrid(timestamp);

            if (grid) {
                const precip = this.samplePrecipitation(grid, lat, lon);
                if (precip !== null && precip >= 0) {
                    totalPrecip += precip * 0.5; // Convert mm/hr to mm for 30min interval
                    validSamples++;
                }
            }
        }

        return validSamples > 0 ? totalPrecip : null;
    }

    async fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null> {
        if (!this.hasCoverage(point)) {
            return null;
        }

        return this.withRetry(async () => {
            const ts = timestamp ? new Date(timestamp) : new Date(await this.getLatestTimestamp());
            const grid = await this.fetchPrecipitationGrid(ts);

            if (!grid) {
                return null;
            }

            const precip = this.samplePrecipitation(grid, point.lat, point.lon);

            if (precip === null) {
                return null;
            }

            return {
                value: precip,
                lat: point.lat,
                lon: point.lon,
                timestamp: ts.toISOString(),
                source: this.metadata.source,
                quality: this.product === 'early' ? 0.80 : this.product === 'late' ? 0.90 : 0.95,
                unit: 'mm/hr'
            };
        }, `fetchPoint(${point.lat}, ${point.lon})`);
    }

    async fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>> {
        const results = new Map<string, GeoData>();
        const ts = timestamp ? new Date(timestamp) : new Date(await this.getLatestTimestamp());

        // Load grid once for all points
        const grid = await this.fetchPrecipitationGrid(ts);
        if (!grid) {
            console.error('[GPM-IMERG] Failed to load precipitation grid');
            return results;
        }

        // Sample all points from same grid
        for (const point of points) {
            if (!this.hasCoverage(point)) continue;

            const precip = this.samplePrecipitation(grid, point.lat, point.lon);
            if (precip !== null && precip >= 0) {
                const key = `${point.lat}_${point.lon}`;
                results.set(key, {
                    value: precip,
                    lat: point.lat,
                    lon: point.lon,
                    timestamp: ts.toISOString(),
                    source: this.metadata.source,
                    quality: this.product === 'early' ? 0.80 : 0.90,
                    unit: 'mm/hr'
                });

                // Also calculate 24h, 48h, 72h accumulations
                try {
                    const precip24h = await this.calculateAccumulation(point.lat, point.lon, 24, ts);
                    if (precip24h !== null) {
                        results.set(`${key}_24h`, {
                            value: precip24h,
                            lat: point.lat,
                            lon: point.lon,
                            timestamp: ts.toISOString(),
                            source: this.metadata.source,
                            quality: 0.85,
                            unit: 'mm'
                        });
                    }

                    const precip72h = await this.calculateAccumulation(point.lat, point.lon, 72, ts);
                    if (precip72h !== null) {
                        results.set(`${key}_72h`, {
                            value: precip72h,
                            lat: point.lat,
                            lon: point.lon,
                            timestamp: ts.toISOString(),
                            source: this.metadata.source,
                            quality: 0.85,
                            unit: 'mm'
                        });
                    }
                } catch (error) {
                    console.warn(`[GPM-IMERG] Failed to calculate accumulations for ${key}:`, error);
                }
            }
        }

        console.log(`[GPM-IMERG] Fetched precipitation for ${results.size} points`);
        return results;
    }

    async fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]> {
        const results: GeoData[] = [];
        const ts = timestamp ? new Date(timestamp) : new Date(await this.getLatestTimestamp());

        const grid = await this.fetchPrecipitationGrid(ts);
        if (!grid) return results;

        // Sample grid at specified resolution
        for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += resolution) {
            for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += resolution) {
                if (!this.hasCoverage({ lat, lon })) continue;

                const precip = this.samplePrecipitation(grid, lat, lon);
                if (precip !== null && precip >= 0) {
                    results.push({
                        value: precip,
                        lat,
                        lon,
                        timestamp: ts.toISOString(),
                        source: this.metadata.source,
                        quality: 0.85,
                        unit: 'mm/hr'
                    });
                }
            }
        }

        return results;
    }
}
