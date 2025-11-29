import axios from 'axios';

async function main() {
    const url = 'http://localhost:3001/api/h3/tile/optimized?x=34&y=23&z=6&compact=true';

    console.log(`Fetching optimized tile from: ${url}`);

    try {
        const response = await axios.get(url);

        console.log('Response Headers:', response.headers);
        console.log('Response Status:', response.status);

        const data = response.data;
        console.log(`Received ${Array.isArray(data) ? data.length : 0} cells.`);

        if (Array.isArray(data) && data.length > 0) {
            const firstCell = data[0];
            console.log('Sample Cell:', JSON.stringify(firstCell));

            // Check for compact keys (i, w, l, s, m)
            if (firstCell.i && firstCell.w !== undefined) {
                console.log('SUCCESS: Response is in compact format.');
            } else {
                console.error('FAILURE: Response is NOT in compact format.');
            }
        } else {
            console.warn('WARNING: No cells returned (might be empty area).');
        }

        // Check for compression header (might be handled by axios automatically, but we check if server sent it)
        // Note: axios decompresses automatically, so content-encoding might not be visible in response.headers depending on config.
        // But we can check X-Cache or X-Compute-Time-Ms which we added.
        if (response.headers['x-compute-time-ms']) {
            console.log('SUCCESS: Custom headers present.');
        }

    } catch (error: any) {
        console.error('Error fetching tile:', error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
        }
    }
}

main().catch(console.error);
