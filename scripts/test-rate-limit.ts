import axios from 'axios';

async function main() {
    const url = 'http://localhost:3001/api/v2/h3/area?minLon=12&minLat=41&maxLon=13&maxLat=42&res=6';
    const limit = 110; // Rate limit is 100
    let success = 0;
    let blocked = 0;

    console.log(`Sending ${limit} requests to ${url}...`);

    const requests = [];
    for (let i = 0; i < limit; i++) {
        requests.push(
            axios.get(url)
                .then(() => { success++; })
                .catch((err) => {
                    if (err.response && err.response.status === 429) {
                        blocked++;
                    } else {
                        console.error('Unexpected error:', err.message);
                    }
                })
        );
    }

    await Promise.all(requests);

    console.log(`Results:`);
    console.log(`- Successful: ${success}`);
    console.log(`- Blocked (429): ${blocked}`);

    if (blocked > 0) {
        console.log('SUCCESS: Rate limiting is active.');
    } else {
        console.error('FAILURE: No requests were rate limited.');
    }
}

main().catch(console.error);
