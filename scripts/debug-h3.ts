import { getH3ScoresForArea } from '../apps/api/src/services/tileOrchestrator';

function tileToLatLonBounds(x: number, y: number, z: number) {
    const tile2long = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
    const tile2lat = (y: number, z: number) => {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    };

    return {
        west: tile2long(x, z),
        north: tile2lat(y, z),
        east: tile2long(x + 1, z),
        south: tile2lat(y + 1, z)
    };
}

async function main() {
    const x = 34;
    const y = 23;
    const z = 6;
    const res = 3;

    console.log(`Testing tile x=${x}, y=${y}, z=${z} at res=${res}`);

    const bounds = tileToLatLonBounds(x, y, z);
    console.log('Bounds:', bounds);

    try {
        const cells = await getH3ScoresForArea({
            minLon: bounds.west,
            minLat: bounds.south,
            maxLon: bounds.east,
            maxLat: bounds.north,
            resolution: res
        });
        console.log(`Generated ${cells.length} cells.`);
        if (cells.length > 0) {
            console.log('Sample:', JSON.stringify(cells[0], null, 2));
        }
    } catch (e: any) {
        console.error('Error generating cells:', e);
        if (e.stack) console.error(e.stack);
    }
}

main();
