import axios from 'axios';

async function main() {
    const url = 'http://localhost:3001/api/ai/analyze';

    // 1x1 pixel transparent GIF base64
    const mockImage = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    const payload = {
        h3Index: "861e82227ffffff",
        features: {
            slope: 35,
            hazardPGA: 0.25,
            rain24h: 50
        },
        risks: {
            landslide: { mean: 0.8, confidence: 0.9 },
            seismic: { mean: 0.6, confidence: 0.7 },
            water: { mean: 0.4, confidence: 0.5 },
            mineral: { mean: 0.1, confidence: 0.3 }
        },
        imagery: {
            base64Image: mockImage
        }
    };

    console.log('Sending analysis request with imagery...');
    try {
        const response = await axios.post(url, payload);
        console.log('Response received:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.insights && response.data.insights.visualConfirmation !== undefined) {
            console.log('SUCCESS: Visual analysis field present in response.');
        } else {
            console.error('FAILURE: Visual analysis field missing.');
        }
    } catch (error: any) {
        if (error.response) {
            console.error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

main().catch(console.error);
