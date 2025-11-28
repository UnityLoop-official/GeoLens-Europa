import { DatasetAdapter, AreaRequest } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';

export class ElsusAdapter implements DatasetAdapter {
    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[ElsusAdapter] Checking ELSUS coverage...');
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(area: AreaRequest, h3Indices: string[]): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        h3Indices.forEach(h3Index => {
            const { lat } = h3ToLatLon(h3Index);
            // Mock ELSUS class (0-5)
            // Higher in mountain ranges
            const isMountain = (lat > 42 && lat < 47);
            const elsusClass = isMountain ? Math.floor(Math.random() * 3) + 3 : Math.floor(Math.random() * 2);

            results[h3Index] = { elsusClass };
        });

        return results;
    }
}
