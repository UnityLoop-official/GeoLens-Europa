
import axios from 'axios';

const MICROSERVICE_URL = 'http://127.0.0.1:8001';

async function testNasaFeed() {
    console.log('Testing NASA Precipitation Microservice at', MICROSERVICE_URL);

    // Some H3 indices from the area (Sardinia/Europe)
    const indices = [
        '841e805ffffffff', // Sample index
        '821f17fffffffff',
        '841f103ffffffff'
    ];

    try {
        console.log('Querying for indices:', indices);
        const response = await axios.post(`${MICROSERVICE_URL}/precip/h3`, {
            h3_indices: indices,
            hours_24: true,
            hours_72: true
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        // Check if any data is non-zero
        const hasRain = Object.values(response.data).some((d: any) => d.precip_24h > 0 || d.precip_72h > 0);
        if (hasRain) {
            console.log('✅ SUCCESS: Found non-zero precipitation data!');
        } else {
            console.log('⚠️ WARNING: All returned precipitation values are 0.0. This might be correct (no rain) or an issue.');
        }

    } catch (error: any) {
        console.error('❌ ERROR querying microservice:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testNasaFeed();
