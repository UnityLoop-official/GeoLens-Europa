import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

const INPUT_DIR = path.resolve(__dirname, '../../data');
const OUTPUT_DIR = path.resolve(__dirname, '../../apps/api/public/tiles');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const generateTiles = async (inputFilename: string, outputFilename: string) => {
    const inputPath = path.join(INPUT_DIR, inputFilename);
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        return;
    }

    console.log(`Generating tiles from ${inputFilename} to ${outputFilename}...`);

    // Tippecanoe command for high performance and automatic zoom
    // -zg: Automatically choose max zoom
    // --drop-densest-as-needed: Drop features if tile is too big (prevents crashes)
    // --force: Overwrite existing output
    // --output-to-directory: Not used here, we want a single .pmtiles archive
    const command = `tippecanoe -zg --drop-densest-as-needed --force -o "${outputPath}" "${inputPath}"`;

    try {
        const { stdout, stderr } = await execAsync(command);
        console.log('Tippecanoe output:', stdout);
        if (stderr) console.error('Tippecanoe stderr:', stderr);
        console.log(`Successfully generated ${outputPath}`);
    } catch (error) {
        console.error('Error executing tippecanoe:', error);
    }
};

// Example usage:
// Ensure you have a 'landslides.geojson' in the 'data' folder at the root
// generateTiles('landslides.geojson', 'landslides.pmtiles');

// For now, we can create a dummy GeoJSON if it doesn't exist to test the pipeline
const dummyGeoJSONPath = path.join(INPUT_DIR, 'dummy.geojson');
if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
}

if (!fs.existsSync(dummyGeoJSONPath)) {
    const dummyData = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { risk: "high" },
                geometry: {
                    type: "Point",
                    coordinates: [12.5, 41.9]
                }
            }
        ]
    };
    fs.writeFileSync(dummyGeoJSONPath, JSON.stringify(dummyData));
}

generateTiles('dummy.geojson', 'dummy.pmtiles');
