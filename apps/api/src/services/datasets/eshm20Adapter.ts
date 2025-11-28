import { DatasetAdapter, AreaRequest } from './types';
import { CellFeatures } from '@geo-lens/geocube';
import { h3ToLatLon } from '@geo-lens/core-geo';

export class Eshm20Adapter implements DatasetAdapter {
    async ensureCoverageForArea(area: AreaRequest): Promise<void> {
        console.log('[Eshm20Adapter] Checking ESHM20 coverage...');
        return Promise.resolve();
    }

    async sampleFeaturesForH3Cells(area: AreaRequest, h3Indices: string[]): Promise<Record<string, Partial<CellFeatures>>> {
        const results: Record<string, Partial<CellFeatures>> = {};

        h3Indices.forEach(h3Index => {
            const { lat, lon } = h3ToLatLon(h3Index);
            // Mock PGA
            // Higher in Italy/Greece
            const isHighSeismic = (lat > 36 && lat < 46 && lon > 10 && lon < 25);
            const hazardPGA = isHighSeismic ? Math.random() * 0.4 + 0.1 : Math.random() * 0.1;

            results[h3Index] = { hazardPGA };
        });

        return results;
    }
}
