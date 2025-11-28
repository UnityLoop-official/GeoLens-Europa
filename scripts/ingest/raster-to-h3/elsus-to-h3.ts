import fs from 'fs';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import { generateH3GridForEurope, h3ToLatLon } from '@geo-lens/core-geo';
import { CONFIG } from '../config';

const OUTPUT_FILE = path.join(CONFIG.DIRS.INTERMEDIATE, 'h3_elsus.csv');

async function processElsus() {
    console.log('Processing ELSUS to H3...');
    const h3Indices = generateH3GridForEurope(CONFIG.H3_RESOLUTION);

    // Mock sampling
    const records = h3Indices.map(h3Index => {
        const { lat } = h3ToLatLon(h3Index);
        // Higher susceptibility in Alps/Apennines (approx lat 42-47)
        const isMountain = lat > 42 && lat < 47;
        const elsusClass = isMountain ? Math.floor(Math.random() * 3) + 3 : Math.floor(Math.random() * 2);

        return { h3Index, elsusClass };
    });

    const csvOutput = stringify(records, { header: true });
    fs.writeFileSync(OUTPUT_FILE, csvOutput);
    console.log(`Wrote ${records.length} records to ${OUTPUT_FILE}`);
}

processElsus().catch(console.error);
