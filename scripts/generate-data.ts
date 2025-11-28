import fs from 'fs';
import path from 'path';
import { getCellFromLatLng, getDisk } from '@geo-lens/core-geo';
import { CellScore } from '@geo-lens/geocube';

const OUTPUT_DIR = path.resolve(__dirname, '../apps/api/public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'h3-data.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const generateData = () => {
    console.log('Generating H3 Data...');

    // Center on Italy (Rome)
    const centerLat = 41.9;
    const centerLon = 12.5;

    // Generate a large disk of cells (resolution 6)
    const centerH3 = getCellFromLatLng(centerLat, centerLon, 6);
    const neighbors = getDisk(centerH3, 15); // Larger radius for "Real Data" feel

    const data: CellScore[] = neighbors.map(h3Index => ({
        h3Index,
        water: {
            stress: Math.random(),
            recharge: Math.random(),
            score: Math.random()
        },
        landslide: {
            susceptibility: Math.random(),
            history: Math.random() > 0.85,
            score: Math.random()
        },
        seismic: {
            pga: Math.random() * 0.5,
            class: Math.random() > 0.8 ? 'HIGH' : (Math.random() > 0.5 ? 'MODERATE' : 'LOW'),
            score: Math.random()
        },
        mineral: {
            prospectivity: Math.random(),
            type: Math.random() > 0.9 ? 'Lithium' : (Math.random() > 0.8 ? 'Copper' : 'None'),
            score: Math.random()
        },
        metadata: {
            lat: centerLat + (Math.random() - 0.5) * 2,
            lon: centerLon + (Math.random() - 0.5) * 2,
            elevation: Math.random() * 2000,
            biome: 'Mediterranean Forests'
        }
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`Generated ${data.length} cells to ${OUTPUT_FILE}`);
};

generateData();
