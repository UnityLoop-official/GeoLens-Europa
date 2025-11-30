/**
 * Base interfaces for real-time geospatial data providers
 *
 * Architecture:
 * - Each provider handles a specific data source (DEM, precipitation, etc.)
 * - Providers implement caching, retry logic, and error handling
 * - All providers return standardized GeoData format
 */

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface GeoData {
    value: number;
    lat: number;
    lon: number;
    timestamp: string;
    source: string;
    quality: number; // 0-1, confidence in data accuracy
    unit: string;
}

export interface ProviderMetadata {
    name: string;
    source: string;
    resolution: string; // e.g., "30m", "0.1deg"
    updateFrequency: string; // e.g., "30min", "static"
    coverage: string; // e.g., "global", "europe"
    latency: string; // e.g., "4-6h", "1-3h", "static"
}

export interface ProviderConfig {
    cacheEnabled: boolean;
    cacheTTL: number; // seconds
    retryAttempts: number;
    retryDelay: number; // milliseconds
    timeout: number; // milliseconds
}

export abstract class BaseGeoProvider {
    protected config: ProviderConfig;
    protected metadata: ProviderMetadata;

    constructor(config: Partial<ProviderConfig> = {}) {
        this.config = {
            cacheEnabled: true,
            cacheTTL: 3600, // 1 hour default
            retryAttempts: 3,
            retryDelay: 1000,
            timeout: 30000,
            ...config
        };

        this.metadata = this.getMetadata();
    }

    /**
     * Get provider metadata
     */
    abstract getMetadata(): ProviderMetadata;

    /**
     * Fetch data for a single point
     */
    abstract fetchPoint(point: GeoPoint, timestamp?: string): Promise<GeoData | null>;

    /**
     * Fetch data for multiple points (batch operation)
     */
    abstract fetchBatch(points: GeoPoint[], timestamp?: string): Promise<Map<string, GeoData>>;

    /**
     * Fetch data for a bounding box area
     */
    abstract fetchArea(bbox: BoundingBox, resolution: number, timestamp?: string): Promise<GeoData[]>;

    /**
     * Check if provider has coverage for given location
     */
    abstract hasCoverage(point: GeoPoint): boolean;

    /**
     * Get latest available timestamp for this data source
     */
    abstract getLatestTimestamp(): Promise<string>;

    /**
     * Retry logic wrapper
     */
    protected async withRetry<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                console.warn(
                    `[${this.metadata.name}] ${operationName} failed (attempt ${attempt}/${this.config.retryAttempts}):`,
                    error
                );

                if (attempt < this.config.retryAttempts) {
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }

        throw new Error(
            `[${this.metadata.name}] ${operationName} failed after ${this.config.retryAttempts} attempts: ${lastError?.message}`
        );
    }

    /**
     * Delay helper for retry logic
     */
    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate cache key for a location
     */
    protected getCacheKey(lat: number, lon: number, timestamp?: string): string {
        const t = timestamp || 'latest';
        return `${this.metadata.name}:${lat.toFixed(6)}:${lon.toFixed(6)}:${t}`;
    }
}
