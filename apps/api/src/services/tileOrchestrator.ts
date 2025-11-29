import { AreaRequest } from './datasets/types';
import { DemAdapter } from './datasets/demAdapter';
import { ElsusAdapter } from './datasets/elsusAdapter';
import { Eshm20Adapter } from './datasets/eshm20Adapter';
import { ClcAdapter } from './datasets/clcAdapter';
import { h3Cache, H3CacheRecord } from './h3Cache';
import { getCellsForBbox } from '@geo-lens/core-geo';
import {
    CellFeatures,
    computeWaterScore,
    computeLandslideScore,
    computeSeismicScore,
    computeMineralScore
} from '@geo-lens/geocube';

const demAdapter = new DemAdapter();
const elsusAdapter = new ElsusAdapter();
const eshm20Adapter = new Eshm20Adapter();
const clcAdapter = new ClcAdapter();

export async function getH3ScoresForArea(area: AreaRequest): Promise<H3CacheRecord[]> {
    const startTime = Date.now();
    console.time('TileOrchestrator:Total');

    // 1. Generate H3 indices for the area
    console.time('TileOrchestrator:GenerateCells');
    const h3Indices = getCellsForBbox({
        west: area.minLon,
        south: area.minLat,
        east: area.maxLon,
        north: area.maxLat
    }, area.resolution);
    console.timeEnd('TileOrchestrator:GenerateCells');

    console.log(`[TileOrchestrator] Request for ${h3Indices.length} cells (Res: ${area.resolution})`);

    // 2. Check Cache
    console.time('TileOrchestrator:CacheLookup');
    const results: H3CacheRecord[] = [];
    const missingIndices: string[] = [];

    h3Indices.forEach(index => {
        const cached = h3Cache.get(index);
        if (cached) {
            results.push(cached);
        } else {
            missingIndices.push(index);
        }
    });
    console.timeEnd('TileOrchestrator:CacheLookup');

    if (missingIndices.length === 0) {
        console.timeEnd('TileOrchestrator:Total');
        console.log(`[TileOrchestrator] Cache hit 100% (${results.length} cells) in ${Date.now() - startTime}ms`);
        return results;
    }

    console.log(`[TileOrchestrator] Computing ${missingIndices.length} new cells...`);

    // 3. Ensure Coverage (Parallel)
    console.time('TileOrchestrator:EnsureCoverage');
    await Promise.all([
        demAdapter.ensureCoverageForArea(area),
        elsusAdapter.ensureCoverageForArea(area),
        eshm20Adapter.ensureCoverageForArea(area),
        clcAdapter.ensureCoverageForArea(area)
    ]);
    console.timeEnd('TileOrchestrator:EnsureCoverage');

    // 4. Sample Features (Parallel)
    console.time('TileOrchestrator:SampleFeatures');
    const [demData, elsusData, eshmData, clcData] = await Promise.all([
        demAdapter.sampleFeaturesForH3Cells(area, missingIndices),
        elsusAdapter.sampleFeaturesForH3Cells(area, missingIndices),
        eshm20Adapter.sampleFeaturesForH3Cells(area, missingIndices),
        clcAdapter.sampleFeaturesForH3Cells(area, missingIndices)
    ]);
    console.timeEnd('TileOrchestrator:SampleFeatures');

    // 5. Compute Scores & Update Cache
    console.time('TileOrchestrator:ComputeScores');

    // Sample 10 random cells for debug logging
    const debugSampleSize = Math.min(10, missingIndices.length);
    const debugIndices = new Set<string>();
    while (debugIndices.size < debugSampleSize) {
        const randomIdx = Math.floor(Math.random() * missingIndices.length);
        debugIndices.add(missingIndices[randomIdx]);
    }

    const newRecords: H3CacheRecord[] = missingIndices.map(h3Index => {
        const dem = demData[h3Index] || {};
        const elsus = elsusData[h3Index] || {};
        const eshm = eshmData[h3Index] || {};
        const clc = clcData[h3Index] || {};

        const features: CellFeatures = {
            h3Index,
            elevation: dem.elevation,
            slope: dem.slope,
            elsusClass: elsus.elsusClass,
            hazardPGA: eshm.hazardPGA,
            clcClass: clc.clcClass
        };

        const waterScore = computeWaterScore(features);
        const landslideScore = computeLandslideScore(features);
        const seismicScore = computeSeismicScore(features);
        const mineralScore = computeMineralScore(features);

        // DEBUG LOGGING for sampled cells
        if (debugIndices.has(h3Index)) {
            console.log(`[RISK DEBUG] Cell ${h3Index}:`);
            console.log(`  Features: elevation=${features.elevation?.toFixed(1) || 'N/A'}m, slope=${features.slope?.toFixed(1) || 'N/A'}°, elsus=${features.elsusClass || 'N/A'}, clc=${features.clcClass || 'N/A'}`);
            console.log(`  Scores: water=${waterScore.toFixed(3)}, landslide=${landslideScore.toFixed(3)}, seismic=${seismicScore.toFixed(3)}, mineral=${mineralScore.toFixed(3)}`);
        }

        const record: H3CacheRecord = {
            h3Index,
            updatedAt: new Date().toISOString(),
            sourceHash: 'v1', // Placeholder
            water: {
                stress: waterScore,           // Water stress = drainage difficulty (0-1)
                recharge: 1 - waterScore,     // Recharge potential = inverse of stress
                score: waterScore
            },
            landslide: { susceptibility: landslideScore, history: false, score: landslideScore },
            seismic: { pga: features.hazardPGA || 0, class: (features.hazardPGA || 0) > 0.2 ? 'HIGH' : 'LOW', score: seismicScore },
            mineral: { prospectivity: mineralScore, type: mineralScore > 0.5 ? 'Potential' : 'None', score: mineralScore },
            metadata: {
                lat: 0, // Could be populated if needed
                lon: 0,
                elevation: features.elevation || 0,
                biome: 'Unknown'
            }
        };

        h3Cache.set(h3Index, record);
        return record;
    });
    console.timeEnd('TileOrchestrator:ComputeScores');

    console.timeEnd('TileOrchestrator:Total');
    console.log(`[TileOrchestrator] Completed in ${Date.now() - startTime}ms`);
    return [...results, ...newRecords];
}
