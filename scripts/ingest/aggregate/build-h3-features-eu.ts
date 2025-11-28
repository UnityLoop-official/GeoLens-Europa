import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
    CellScore,
    CellFeatures,
    computeWaterScore,
    computeLandslideScore,
    computeSeismicScore,
    computeMineralScore
} from '@geo-lens/geocube';
import { CONFIG } from '../config';

const OUTPUT_FILE = path.join(CONFIG.DIRS.OUTPUT, 'h3-data.json');

// Helper to read CSV into a Map
function readCsvToMap(filename: string, fields: string[]): Map<string, any> {
    const filePath = path.join(CONFIG.DIRS.INTERMEDIATE, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: ${filename} not found. Skipping.`);
        return new Map();
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    const map = new Map<string, any>();
    records.forEach((record: any) => {
        const data: any = {};
        fields.forEach(f => data[f] = parseFloat(record[f]));
        map.set(record.h3Index, data);
    });
    return map;
}

async function aggregate() {
    console.log('Aggregating H3 Features...');

    // 1. Load all intermediate data
    const demMap = readCsvToMap('h3_dem.csv', ['elevation', 'slope']);
    const elsusMap = readCsvToMap('h3_elsus.csv', ['elsusClass']);
    const eshmMap = readCsvToMap('h3_eshm20.csv', ['hazardPGA']);
    const clcMap = readCsvToMap('h3_clc.csv', ['clcClass']);

    // 2. Get all unique H3 indices
    const allIndices = new Set<string>([
        ...demMap.keys(),
        ...elsusMap.keys(),
        ...eshmMap.keys(),
        ...clcMap.keys()
    ]);

    console.log(`Found ${allIndices.size} unique H3 cells.`);

    const finalData: CellScore[] = [];

    // 3. Join and Compute Scores
    for (const h3Index of allIndices) {
        const dem = demMap.get(h3Index) || {};
        const elsus = elsusMap.get(h3Index) || {};
        const eshm = eshmMap.get(h3Index) || {};
        const clc = clcMap.get(h3Index) || {};

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

        finalData.push({
            h3Index,
            water: {
                stress: 0.5, // Placeholder
                recharge: 0.5, // Placeholder
                score: waterScore
            },
            landslide: {
                susceptibility: landslideScore,
                history: false,
                score: landslideScore
            },
            seismic: {
                pga: features.hazardPGA || 0,
                class: (features.hazardPGA || 0) > 0.2 ? 'HIGH' : 'LOW',
                score: seismicScore
            },
            mineral: {
                prospectivity: mineralScore,
                type: mineralScore > 0.5 ? 'Potential' : 'None',
                score: mineralScore
            },
            metadata: {
                lat: 0, // TODO: Recalculate if needed, or get from DEM map if we stored it
                lon: 0,
                elevation: features.elevation || 0,
                biome: 'Unknown'
            }
        });
    }

    // 4. Write Output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`Successfully generated ${finalData.length} cells to ${OUTPUT_FILE}`);
}

aggregate().catch(console.error);
