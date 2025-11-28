import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config';

const DEM_DIR = path.join(CONFIG.DIRS.RAW, 'dem/eu');

if (!fs.existsSync(DEM_DIR)) {
    fs.mkdirSync(DEM_DIR, { recursive: true });
}

async function downloadDEM() {
    console.log('Starting DEM Download (Mocked for MVP - Real logic would list S3 bucket)...');

    // In a real scenario, we would:
    // 1. Fetch tile list from S3
    // 2. Filter by EU BBOX
    // 3. Download each .tif

    // For now, we'll just ensure the directory exists and maybe create a dummy file if empty
    // to allow the next steps to proceed without crashing.

    const dummyFile = path.join(DEM_DIR, 'eu_dem_dummy.tif');
    if (!fs.existsSync(dummyFile)) {
        console.log('Creating dummy DEM file for testing...');
        fs.writeFileSync(dummyFile, 'DUMMY DEM CONTENT');
    }

    console.log(`DEM download complete (checked ${DEM_DIR})`);
}

downloadDEM().catch(console.error);
