import { GeoLensClient } from '../packages/client-sdk/src/index';

async function main() {
    console.log('Initializing GeoLens Client...');
    const client = new GeoLensClient({
        baseUrl: 'http://localhost:3001'
    });

    console.log('Fetching risks for area...');
    try {
        const response = await client.getRisksForArea({
            minLon: 12,
            minLat: 41,
            maxLon: 13,
            maxLat: 42,
            res: 6
        });

        console.log('Response received:');
        console.log(`- Area: ${JSON.stringify(response.area)}`);
        console.log(`- Cells: ${response.cells.length}`);
        if (response.cells.length > 0) {
            console.log(`- Sample Cell: ${response.cells[0].h3Index}`);
            console.log(`- Risks: ${JSON.stringify(response.cells[0].risks, null, 2)}`);
        }

        console.log('SUCCESS: Client SDK is working.');
    } catch (error) {
        console.error('FAILURE: Client SDK request failed.', error);
    }
}

main().catch(console.error);
