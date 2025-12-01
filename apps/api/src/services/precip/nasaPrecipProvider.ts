/**
 * NASA IMERG Precipitation Provider
 *
 * Calls the NASA precipitation microservice (Python FastAPI) to get
 * real-time precipitation data from GPM IMERG for H3 hexagons.
 *
 * NO MOCK DATA - All precipitation values from NASA satellite data.
 *
 * Microservice endpoints:
 * - POST /precip/h3 - Get precipitation for H3 cells
 * - GET /health - Service health check
 */

import axios, { AxiosError } from 'axios';

const NASA_PRECIP_URL = process.env.NASA_PRECIP_URL || 'http://127.0.0.1:8001';
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds (enough for cold start data fetch)
const MAX_RETRIES = 2;

export interface PrecipData {
    rain24h_mm: number;
    rain72h_mm: number;
}

interface PrecipCell {
    h3_index: string;
    rain24h_mm: number | null;
    rain72h_mm: number | null;
}

interface PrecipResponse {
    cells: PrecipCell[];
    source: string;
    t_ref: string;
    cached: boolean;
}

interface PrecipRequest {
    h3_indices: string[];
    t_ref?: string;
    hours_24: boolean;
    hours_72: boolean;
}

export class NasaPrecipProvider {
    private baseUrl: string;
    private healthCheckPassed: boolean = false;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || NASA_PRECIP_URL;
        console.log(`[NASA-Precip] Provider initialized with URL: ${this.baseUrl}`);
    }

    /**
     * Check if NASA precipitation service is healthy
     *
     * @returns true if service is available, false otherwise
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/health`, {
                timeout: 5000
            });

            this.healthCheckPassed = response.status === 200 && response.data.status === 'healthy';

            if (this.healthCheckPassed) {
                console.log('[NASA-Precip] ✅ Service is healthy');
            } else {
                console.warn('[NASA-Precip] ⚠️ Service returned non-healthy status');
            }

            return this.healthCheckPassed;

        } catch (error) {
            console.warn(`[NASA-Precip] ⚠️ Health check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
            this.healthCheckPassed = false;
            return false;
        }
    }

    /**
     * Get precipitation data for list of H3 cells
     *
     * Calls NASA precipitation microservice to fetch real-time IMERG data.
     * Automatically retries on failure.
     *
     * @param h3Indices - List of H3 cell indices
     * @param tRef - Reference timestamp (defaults to current UTC time)
     * @returns Map of h3_index -> {rain24h_mm, rain72h_mm}
     * @throws Error if service unavailable after retries
     */
    async getForH3Indices(
        h3Indices: string[],
        tRef?: Date
    ): Promise<Record<string, PrecipData>> {
        if (h3Indices.length === 0) {
            return {};
        }

        console.log(`[NASA-Precip] Requesting precipitation for ${h3Indices.length} H3 cells`);

        const request: PrecipRequest = {
            h3_indices: h3Indices,
            t_ref: tRef?.toISOString(),
            hours_24: true,
            hours_72: true
        };

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await axios.post<PrecipResponse>(
                    `${this.baseUrl}/precip/h3`,
                    request,
                    {
                        timeout: REQUEST_TIMEOUT_MS,
                        maxRedirects: 5, // Allow some redirects
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                const { cells, source, cached } = response.data;

                console.log(`[NASA-Precip] ✅ Received ${cells.length} cells from ${source} (cached: ${cached})`);

                // Convert array response to map
                const result: Record<string, PrecipData> = {};

                for (const cell of cells) {
                    result[cell.h3_index] = {
                        rain24h_mm: cell.rain24h_mm ?? 0,
                        rain72h_mm: cell.rain72h_mm ?? 0
                    };
                }

                // Log statistics
                if (cells.length > 0) {
                    const rain24h_values = cells.map(c => c.rain24h_mm ?? 0);
                    const rain72h_values = cells.map(c => c.rain72h_mm ?? 0);

                    const avg24h = rain24h_values.reduce((a, b) => a + b, 0) / cells.length;
                    const max24h = Math.max(...rain24h_values);
                    const avg72h = rain72h_values.reduce((a, b) => a + b, 0) / cells.length;
                    const max72h = Math.max(...rain72h_values);

                    console.log(`[NASA-Precip] Statistics:`);
                    console.log(`  24h: avg=${avg24h.toFixed(1)}mm, max=${max24h.toFixed(1)}mm`);
                    console.log(`  72h: avg=${avg72h.toFixed(1)}mm, max=${max72h.toFixed(1)}mm`);
                }

                return result;

            } catch (error) {
                lastError = error as Error;

                if (axios.isAxiosError(error)) {
                    const axiosError = error as AxiosError;

                    if (axiosError.code === 'ECONNREFUSED') {
                        console.error(`[NASA-Precip] ❌ Connection refused - is microservice running at ${this.baseUrl}?`);
                    } else if (axiosError.code === 'ETIMEDOUT') {
                        console.error(`[NASA-Precip] ⏱️ Request timeout (attempt ${attempt}/${MAX_RETRIES})`);
                    } else if (axiosError.response) {
                        console.error(`[NASA-Precip] ❌ HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`);
                    } else {
                        console.error(`[NASA-Precip] ❌ Request failed: ${axiosError.message}`);
                    }
                } else {
                    console.error(`[NASA-Precip] ❌ Unknown error: ${error instanceof Error ? error.message : 'unknown'}`);
                }

                if (attempt < MAX_RETRIES) {
                    const delayMs = 2000 * attempt; // 2s, 4s
                    console.log(`[NASA-Precip] Retrying in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        // All retries failed
        console.error(`[NASA-Precip] ❌ Failed after ${MAX_RETRIES} attempts`);
        throw new Error(`NASA precipitation service unavailable: ${lastError?.message}`);
    }

    /**
     * Get precipitation data with fallback to zeros if service unavailable
     *
     * Use this when precipitation is optional and you want graceful degradation.
     *
     * @param h3Indices - List of H3 cell indices
     * @param tRef - Reference timestamp
     * @returns Map of h3_index -> {rain24h_mm, rain72h_mm}, zeros on failure
     */
    async getForH3IndicesWithFallback(
        h3Indices: string[],
        tRef?: Date
    ): Promise<Record<string, PrecipData>> {
        try {
            return await this.getForH3Indices(h3Indices, tRef);
        } catch (error) {
            console.warn(`[NASA-Precip] ⚠️ Falling back to zero precipitation due to error: ${error instanceof Error ? error.message : 'unknown'}`);

            // Return zeros for all cells
            const fallback: Record<string, PrecipData> = {};
            for (const h3Index of h3Indices) {
                fallback[h3Index] = {
                    rain24h_mm: 0,
                    rain72h_mm: 0
                };
            }

            return fallback;
        }
    }

    /**
     * Batch request - splits large H3 lists into chunks
     *
     * Prevents overwhelming the microservice with massive requests.
     *
     * @param h3Indices - List of H3 cell indices
     * @param tRef - Reference timestamp
     * @param chunkSize - Max cells per request (default: 5000)
     * @returns Combined map of all results
     */
    async getForH3IndicesBatched(
        h3Indices: string[],
        tRef?: Date,
        chunkSize: number = 5000
    ): Promise<Record<string, PrecipData>> {
        if (h3Indices.length <= chunkSize) {
            return this.getForH3Indices(h3Indices, tRef);
        }

        console.log(`[NASA-Precip] Batching ${h3Indices.length} cells into chunks of ${chunkSize}`);

        const chunks: string[][] = [];
        for (let i = 0; i < h3Indices.length; i += chunkSize) {
            chunks.push(h3Indices.slice(i, i + chunkSize));
        }

        const results = await Promise.all(
            chunks.map(chunk => this.getForH3Indices(chunk, tRef))
        );

        // Merge results
        const combined: Record<string, PrecipData> = {};
        for (const result of results) {
            Object.assign(combined, result);
        }

        console.log(`[NASA-Precip] ✅ Batched request complete: ${Object.keys(combined).length} cells`);

        return combined;
    }
}

// Singleton instance
let providerInstance: NasaPrecipProvider | null = null;

/**
 * Get singleton NASA precipitation provider instance
 *
 * Creates provider on first call, reuses on subsequent calls.
 */
export function getNasaPrecipProvider(): NasaPrecipProvider {
    if (!providerInstance) {
        providerInstance = new NasaPrecipProvider();
    }
    return providerInstance;
}

/**
 * Check if NASA precipitation service is enabled
 *
 * @returns true if USE_REAL_DATA=true, false otherwise
 */
export function isNasaPrecipEnabled(): boolean {
    return process.env.USE_REAL_DATA === 'true';
}
