/**
 * Real Precipitation Adapter - GPM IMERG for real-time precipitation data
 */

import { DatasetAdapter, AreaRequest } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';
import { GPMIMERGProvider } from './providers/gpmIMERG';

export class RealPrecipitationAdapter implements DatasetAdapter {
    private provider: GPMIMERGProvider;

    constructor() {
        this.provider = new GPMIMERGProvider({ product: 'early' }); // Use Early Run for real-time (4-6h latency)
        console.log('[RealPrecipitationAdapter] Initialized with GPM IMERG Early Run provider');
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[RealPrecipitationAdapter] Coverage check:', {
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

        console.log(`[RealPrecipitationAdapter] Fetching real-time precipitation for ${h3Indices.length} cells`);

        const points = h3Indices.map(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            return { lat, lon, h3Index };
        });

        const geoPoints = points.map(p => ({ lat: p.lat, lon: p.lon }));
        const geoData = await this.provider.fetchBatch(geoPoints);

        for (const point of points) {
            const key24h = `${point.lat}_${point.lon}_24h`;
            const key72h = `${point.lat}_${point.lon}_72h`;
            const keyInstant = `${point.lat}_${point.lon}`;

            const precip24h = geoData.get(key24h);
            const precip72h = geoData.get(key72h);
            const precipInstant = geoData.get(keyInstant);

            if (precip24h || precip72h || precipInstant) {
                results[point.h3Index] = {
                    rain24h: precip24h?.value ?? undefined,
                    rain72h: precip72h?.value ?? undefined,
                    // Also store instantaneous rate if needed
                    ...(precipInstant ? { rainRate: precipInstant.value } : {})
                };
            }
        }

        const successCount = Object.keys(results).length;
        const successRate = ((successCount / h3Indices.length) * 100).toFixed(1);

        console.log(`[RealPrecipitationAdapter] Successfully fetched ${successCount}/${h3Indices.length} cells (${successRate}%)`);

        return results;
    }
}
