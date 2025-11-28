import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config';

const ELSUS_DIR = path.join(CONFIG.DIRS.RAW, 'elsus');
const OUTPUT_FILE = path.join(ELSUS_DIR, 'elsus_v2.tif');

if (!fs.existsSync(ELSUS_DIR)) {
    fs.mkdirSync(ELSUS_DIR, { recursive: true });
}

async function downloadElsus() {
    const url = CONFIG.URLS.ELSUS;
    if (!url) {
        console.warn('Skipping ELSUS download: ELSUS_DOWNLOAD_URL not set in env.');
        return;
    }

    if (fs.existsSync(OUTPUT_FILE)) {
        console.log('ELSUS file already exists. Skipping.');
        return;
    }

    console.log(`Downloading ELSUS from ${url}...`);
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(OUTPUT_FILE);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Failed to download ELSUS:', error);
    }
}

downloadElsus().catch(console.error);
