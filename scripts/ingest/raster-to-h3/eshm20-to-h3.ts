import fs from 'fs';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import { generateH3GridForEurope, h3ToLatLon } from '@geo-lens/core-geo';
import { CONFIG } from '../config';

const OUTPUT_FILE = path.join(CONFIG.DIRS.INTERMEDIATE, 'h3_eshm20.csv');

async function processEshm() {
    console.log('Processing ESHM20 to H3...');
    const h3Indices = generateH3GridForEurope(CONFIG.H3_RESOLUTION);

    // Mock sampling
    const records = h3Indices.map(h3Index => {
        const { lat, lon } = h3ToLatLon(h3Index);
        // Higher seismic hazard in Italy/Greece
        const isHighSeismic = (lat > 36 && lat < 46 && lon > 10 && lon < 25);
        const hazardPGA = isHighSeismic ? Math.random() * 0.4 + 0.1 : Math.random() * 0.1;

        return { h3Index, hazardPGA };
    });

    const csvOutput = stringify(records, { header: true });
    fs.writeFileSync(OUTPUT_FILE, csvOutput);
    console.log(`Wrote ${records.length} records to ${OUTPUT_FILE}`);
}

processEshm().catch(console.error);
