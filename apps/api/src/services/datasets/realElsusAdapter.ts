/**
 * Real ELSUS Adapter - Bridge between DatasetAdapter interface and ELSUSProvider
 */

import { DatasetAdapter, AreaRequest } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';
import { ELSUSProvider } from './providers/elsus';

export class RealElsusAdapter implements DatasetAdapter {
    private provider: ELSUSProvider;

    constructor() {
        this.provider = new ELSUSProvider();
        console.log('[RealElsusAdapter] Initialized with ELSUS v2 provider');
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[RealElsusAdapter] Coverage check:', {
            bbox: `${area.minLat},${area.minLon} - ${area.maxLat},${area.maxLon}`,
            provider: this.provider.getMetadata().name
        });
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(
        area: AreaRequest,
        h3Indices: string[]
    ): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        console.log(`[RealElsusAdapter] Fetching real landslide susceptibility for ${h3Indices.length} cells`);

        const points = h3Indices.map(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            return { lat, lon, h3Index };
        });

        let geoData = new Map<string, { value: number; source: string }>();
        try {
            const geoPoints = points.map(p => ({ lat: p.lat, lon: p.lon }));
            geoData = await this.provider.fetchBatch(geoPoints);
        } catch (error) {
            console.error('[RealElsusAdapter] Failed to fetch ELSUS data:', error);
        }

        for (const point of points) {
            const key = `${point.lat}_${point.lon}`;
            const data = geoData.get(key);

            if (data) {
                results[point.h3Index] = {
                    elsusClass: data.value
                };
            }
        }

        const successCount = Object.keys(results).length;
        const successRate = ((successCount / h3Indices.length) * 100).toFixed(1);

        console.log(`[RealElsusAdapter] Successfully fetched ${successCount}/${h3Indices.length} cells (${successRate}%)`);

        return results;
    }
}
