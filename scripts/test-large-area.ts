import { getH3ScoresForArea } from '../apps/api/src/services/tileOrchestrator';

async function testLarge() {
    console.log('Testing Large Area (Whole Italy approx)...');
    const area = {
        minLon: 6.0,
        minLat: 36.0,
        maxLon: 19.0,
        maxLat: 47.0,
        resolution: 6
    };

    const start = Date.now();
    try {
        const results = await getH3ScoresForArea(area);
        const duration = (Date.now() - start) / 1000;
        console.log(`Success! Got ${results.length} cells in ${duration.toFixed(2)}s.`);
    } catch (error) {
        console.error('Error testing large area:', error);
    }
}

testLarge();
