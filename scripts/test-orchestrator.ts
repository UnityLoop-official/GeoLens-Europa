import { getH3ScoresForArea } from '../apps/api/src/services/tileOrchestrator';

async function test() {
    console.log('Testing Tile Orchestrator...');
    const area = {
        minLon: 12.4,
        minLat: 41.8,
        maxLon: 12.6,
        maxLat: 42.0,
        resolution: 6
    };

    try {
        const results = await getH3ScoresForArea(area);
        console.log(`Success! Got ${results.length} cells.`);
        if (results.length > 0) {
            console.log('Sample cell:', JSON.stringify(results[0], null, 2));
        }
    } catch (error) {
        console.error('Error testing orchestrator:', error);
    }
}

test();
