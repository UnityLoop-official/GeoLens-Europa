/**
 * Real CLC Adapter - Bridge between DatasetAdapter interface and CorineLandCoverProvider
 */

import { DatasetAdapter, AreaRequest } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';
import { CorineLandCoverProvider } from './providers/corineLandCover';

export class RealClcAdapter implements DatasetAdapter {
    private provider: CorineLandCoverProvider;

    constructor() {
        this.provider = new CorineLandCoverProvider();
        console.log('[RealClcAdapter] Initialized with Corine Land Cover 2018 provider');
    }

    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[RealClcAdapter] Coverage check:', {
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

        console.log(`[RealClcAdapter] Fetching real land cover classification for ${h3Indices.length} cells`);

        const points = h3Indices.map(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            return { lat, lon, h3Index };
        });

        const geoPoints = points.map(p => ({ lat: p.lat, lon: p.lon }));
        const geoData = await this.provider.fetchBatch(geoPoints);

        for (const point of points) {
            const key = `${point.lat}_${point.lon}`;
            const data = geoData.get(key);

            if (data) {
                results[point.h3Index] = {
                    clcClass: data.value
                };
            }
        }

        const successCount = Object.keys(results).length;
        const successRate = ((successCount / h3Indices.length) * 100).toFixed(1);

        console.log(`[RealClcAdapter] Successfully fetched ${successCount}/${h3Indices.length} cells (${successRate}%)`);

        return results;
    }
}
