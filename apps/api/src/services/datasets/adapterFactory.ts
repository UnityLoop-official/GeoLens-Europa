/**
 * Adapter Factory - Centralized selection between mock and real data providers
 *
 * Environment variable USE_REAL_DATA controls which adapters to use:
 * - USE_REAL_DATA=true  -> Use real satellite/geospatial data providers
 * - USE_REAL_DATA=false -> Use mock data generators (faster, no external dependencies)
 */

import { DatasetAdapter } from './types';

// Mock adapters
import { DemAdapter } from './demAdapter';
import { ElsusAdapter } from './elsusAdapter';
import { Eshm20Adapter } from './eshm20Adapter';
import { ClcAdapter } from './clcAdapter';

// Real adapters
import { RealDemAdapter } from './realDemAdapter';
import { RealElsusAdapter } from './realElsusAdapter';
import { RealEshm20Adapter } from './realEshm20Adapter';
import { RealClcAdapter } from './realClcAdapter';
import { RealPrecipitationAdapter } from './realPrecipitationAdapter';

export interface DataAdapters {
    dem: DatasetAdapter;
    elsus: DatasetAdapter;
    eshm20: DatasetAdapter;
    clc: DatasetAdapter;
    precipitation?: DatasetAdapter; // Optional, only available with real data
}

/**
 * Create data adapters based on environment configuration
 */
export function createDataAdapters(): DataAdapters {
    const useRealData = process.env.USE_REAL_DATA === 'true';

    if (useRealData) {
        console.log('🌍 [AdapterFactory] Using REAL geospatial data providers');
        console.log('   ├─ Copernicus DEM (30m elevation, AWS S3)');
        console.log('   ├─ GPM IMERG (real-time precipitation, NASA)');
        console.log('   ├─ ELSUS v2 (landslide susceptibility, ESDAC)');
        console.log('   ├─ ESHM20 (seismic hazard, EFEHR)');
        console.log('   └─ CLC2018 (land cover, Copernicus)');

        return {
            dem: new RealDemAdapter(),
            elsus: new RealElsusAdapter(),
            eshm20: new RealEshm20Adapter(),
            clc: new RealClcAdapter(),
            precipitation: new RealPrecipitationAdapter()
        };
    } else {
        console.log('🔧 [AdapterFactory] Using MOCK data generators (for testing/development)');
        console.log('   Set USE_REAL_DATA=true to enable real satellite data');

        return {
            dem: new DemAdapter(),
            elsus: new ElsusAdapter(),
            eshm20: new Eshm20Adapter(),
            clc: new ClcAdapter()
        };
    }
}

/**
 * Get description of current data source mode
 */
export function getDataSourceInfo(): {
    mode: 'real' | 'mock';
    providers: string[];
    latency: string;
    coverage: string;
} {
    const useRealData = process.env.USE_REAL_DATA === 'true';

    if (useRealData) {
        return {
            mode: 'real',
            providers: [
                'Copernicus DEM GLO-30 (AWS S3)',
                'GPM IMERG Early Run (NASA GES DISC)',
                'ELSUS v2 (ESDAC/JRC)',
                'ESHM20 (EFEHR)',
                'CLC2018 (Copernicus Land Monitoring)'
            ],
            latency: '4-6 hours (precipitation), static (terrain/hazard)',
            coverage: 'Europe (35°N-72°N, -10°W-30°E) + Global DEM'
        };
    } else {
        return {
            mode: 'mock',
            providers: ['Synthetic data generators'],
            latency: 'instant',
            coverage: 'global (mock)'
        };
    }
}
