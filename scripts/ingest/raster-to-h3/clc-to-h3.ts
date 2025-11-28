import fs from 'fs';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import { generateH3GridForEurope, h3ToLatLon } from '@geo-lens/core-geo';
import { CONFIG } from '../config';

const OUTPUT_FILE = path.join(CONFIG.DIRS.INTERMEDIATE, 'h3_clc.csv');

async function processClc() {
    console.log('Processing CLC to H3...');
    const h3Indices = generateH3GridForEurope(CONFIG.H3_RESOLUTION);

    // Mock sampling
    const records = h3Indices.map(h3Index => {
        // Random land cover class (1-44)
        const clcClass = Math.floor(Math.random() * 44) + 1;
        return { h3Index, clcClass };
    });

    const csvOutput = stringify(records, { header: true });
    fs.writeFileSync(OUTPUT_FILE, csvOutput);
    console.log(`Wrote ${records.length} records to ${OUTPUT_FILE}`);
}

processClc().catch(console.error);
