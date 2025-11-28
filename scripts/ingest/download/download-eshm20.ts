import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config';

const ESHM_DIR = path.join(CONFIG.DIRS.RAW, 'eshm20');
const OUTPUT_FILE = path.join(ESHM_DIR, 'eshm20_pga.tif');

if (!fs.existsSync(ESHM_DIR)) {
    fs.mkdirSync(ESHM_DIR, { recursive: true });
}

async function downloadEshm() {
    const url = CONFIG.URLS.ESHM20;
    if (!url) {
        console.warn('Skipping ESHM20 download: ESHM20_DOWNLOAD_URL not set in env.');
        return;
    }

    if (fs.existsSync(OUTPUT_FILE)) {
        console.log('ESHM20 file already exists. Skipping.');
        return;
    }

    console.log(`Downloading ESHM20 from ${url}...`);
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
        console.error('Failed to download ESHM20:', error);
    }
}

downloadEshm().catch(console.error);
