import axios, { AxiosInstance, AxiosError } from 'axios';

export interface GeoLensConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
}

export interface AreaRequest {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
    res?: number;
    timestamp?: string;
}

export interface RiskDistribution {
    mean: number;
    p_low: number;
    p_medium: number;
    p_high: number;
    variance: number;
    confidence: number;
    explanation?: string;
    isPlaceholder?: boolean;
}

export interface H3CellRisk {
    h3Index: string;
    timestamp: string;
    risks: {
        landslide: RiskDistribution;
        seismic: RiskDistribution;
        water: RiskDistribution;
        mineral: RiskDistribution;
    };
    metadata: {
        dataSource: 'datacube' | 'adapters';
        cacheHit?: boolean;
        computeTimeMs: number;
    };
}

export interface AreaResponse {
    area: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
        resolution: number;
    };
    timestamp: string;
    cells: H3CellRisk[];
    metrics?: any;
}

export class GeoLensClient {
    private client: AxiosInstance;

    constructor(config: GeoLensConfig) {
        this.client = axios.create({
            baseURL: config.baseUrl,
            timeout: config.timeout || 30000,
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
            }
        });
    }

    /**
     * Get risk data for a specific area (bounding box)
     */
    async getRisksForArea(request: AreaRequest): Promise<AreaResponse> {
        try {
            const response = await this.client.get<AreaResponse>('/api/v2/h3/area', {
                params: request
            });
            return response.data;
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    /**
     * Get raw tile data (protobuf/json) for visualization
     */
    async getTile(z: number, x: number, y: number): Promise<any> {
        try {
            const response = await this.client.get(`/api/h3/tile`, {
                params: { z, x, y },
                responseType: 'arraybuffer' // Assuming binary tile data eventually
            });
            return response.data;
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            if (axiosError.response) {
                console.error(`API Error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`);
                if (axiosError.response.status === 429) {
                    console.warn('Rate limit exceeded. Please slow down requests.');
                }
            } else if (axiosError.request) {
                console.error('No response received from API');
            } else {
                console.error('Error setting up request:', axiosError.message);
            }
        } else {
            console.error('Unknown error:', error);
        }
    }
}
