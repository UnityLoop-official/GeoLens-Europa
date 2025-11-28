import fs from 'fs';
import path from 'path';
import { getCellFromLatLng } from '@geo-lens/core-geo';
import { CellScore } from '@geo-lens/geocube';

const INPUT_FILE = path.resolve(__dirname, '../../data/source_data.csv');
const OUTPUT_DIR = path.resolve(__dirname, '../../apps/api/public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'h3-data.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface RawDataPoint {
    lat: number;
    lon: number;
    water: number;
    landslide: number;
    seismic: number;
    mineral: number;
    elevation: number;
}

const processData = () => {
    console.log(`Reading data from ${INPUT_FILE}...`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Input file not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(INPUT_FILE, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const headers = lines[0].split(',');

    const dataPoints: RawDataPoint[] = [];

    // Parse CSV (Skip header)
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < headers.length) continue;

        dataPoints.push({
            lat: parseFloat(values[0]),
            lon: parseFloat(values[1]),
            water: parseFloat(values[2]),
            landslide: parseFloat(values[3]),
            seismic: parseFloat(values[4]),
            mineral: parseFloat(values[5]),
            elevation: parseFloat(values[6])
        });
    }

    console.log(`Parsed ${dataPoints.length} points.`);

    // Aggregate by H3 Index
    const h3Map = new Map<string, {
        count: number;
        water: number;
        landslide: number;
        seismic: number;
        mineral: number;
        elevation: number;
        latSum: number;
        lonSum: number;
    }>();

    const RESOLUTION = 6;

    dataPoints.forEach(point => {
        const h3Index = getCellFromLatLng(point.lat, point.lon, RESOLUTION);

        if (!h3Map.has(h3Index)) {
            h3Map.set(h3Index, {
                count: 0,
                water: 0,
                landslide: 0,
                seismic: 0,
                mineral: 0,
                elevation: 0,
                latSum: 0,
                lonSum: 0
            });
        }

        const cell = h3Map.get(h3Index)!;
        cell.count++;
        cell.water += point.water;
        cell.landslide += point.landslide;
        cell.seismic += point.seismic;
        cell.mineral += point.mineral;
        cell.elevation += point.elevation;
        cell.latSum += point.lat;
        cell.lonSum += point.lon;
    });

    // Convert to CellScore array
    const outputData: CellScore[] = Array.from(h3Map.entries()).map(([h3Index, data]) => ({
        h3Index,
        water: {
            stress: data.water / data.count,
            recharge: 0.5, // Default/Placeholder if missing
            score: data.water / data.count
        },
        landslide: {
            susceptibility: data.landslide / data.count,
            history: (data.landslide / data.count) > 0.5,
            score: data.landslide / data.count
        },
        seismic: {
            pga: (data.seismic / data.count) * 0.5, // Mock conversion
            class: (data.seismic / data.count) > 0.6 ? 'HIGH' : 'LOW',
            score: data.seismic / data.count
        },
        mineral: {
            prospectivity: data.mineral / data.count,
            type: (data.mineral / data.count) > 0.5 ? 'Copper' : 'None',
            score: data.mineral / data.count
        },
        metadata: {
            lat: data.latSum / data.count,
            lon: data.lonSum / data.count,
            elevation: data.elevation / data.count,
            biome: 'Mixed'
        }
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`Successfully generated ${outputData.length} H3 cells to ${OUTPUT_FILE}`);
};

processData();
