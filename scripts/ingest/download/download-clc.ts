import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config';

const CLC_DIR = path.join(CONFIG.DIRS.RAW, 'clc');
const OUTPUT_FILE = path.join(CLC_DIR, 'clc_eu.tif');

if (!fs.existsSync(CLC_DIR)) {
    fs.mkdirSync(CLC_DIR, { recursive: true });
}

async function downloadClc() {
    const url = CONFIG.URLS.CLC;
    if (!url) {
        console.warn('Skipping CLC download: CLC_DOWNLOAD_URL not set in env.');
        return;
    }

    if (fs.existsSync(OUTPUT_FILE)) {
        console.log('CLC file already exists. Skipping.');
        return;
    }

    console.log(`Downloading CLC from ${url}...`);
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
        console.error('Failed to download CLC:', error);
    }
}

downloadClc().catch(console.error);
