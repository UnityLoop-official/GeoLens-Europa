import fs from 'fs';
import path from 'path';
import { fromFile } from 'geotiff';
import { stringify } from 'csv-stringify/sync';
import { generateH3GridForEurope, h3ToLatLon } from '@geo-lens/core-geo';
import { CONFIG } from '../config';

const DEM_DIR = path.join(CONFIG.DIRS.RAW, 'dem/eu');
const OUTPUT_FILE = path.join(CONFIG.DIRS.INTERMEDIATE, 'h3_dem.csv');

// Ensure intermediate directory exists
if (!fs.existsSync(CONFIG.DIRS.INTERMEDIATE)) {
    fs.mkdirSync(CONFIG.DIRS.INTERMEDIATE, { recursive: true });
}

async function processDem() {
    console.log('Processing DEM to H3...');

    // 1. Generate H3 Grid
    const h3Indices = generateH3GridForEurope(CONFIG.H3_RESOLUTION);
    console.log(`Generated ${h3Indices.length} H3 cells for Europe.`);

    // 2. Open DEM (For MVP, we assume a single merged file or iterate tiles. 
    // Real implementation would find the correct tile for each point)
    // Here we just use the dummy file to demonstrate the loop.
    const demPath = path.join(DEM_DIR, 'eu_dem_dummy.tif');

    if (!fs.existsSync(demPath)) {
        console.error('DEM file not found. Run download first.');
        return;
    }

    // Mock sampling for MVP since we don't have the real 50GB DEM
    const records = h3Indices.map(h3Index => {
        const { lat, lon } = h3ToLatLon(h3Index);
        // Mock elevation/slope based on lat/lon
        const elevation = Math.max(0, (Math.sin(lat * 0.1) + Math.cos(lon * 0.1)) * 1000);
        const slope = Math.random() * 45;

        return { h3Index, elevation, slope };
    });

    // 3. Write to CSV
    const csvOutput = stringify(records, { header: true });
    fs.writeFileSync(OUTPUT_FILE, csvOutput);
    console.log(`Wrote ${records.length} records to ${OUTPUT_FILE}`);
}

processDem().catch(console.error);
