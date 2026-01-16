
const fs = require('fs');
const http = require('http');
const path = require('path');

const geojsonPath = path.join(__dirname, 'stormwater_network_example.geojson');
const geojsonData = fs.readFileSync(geojsonPath, 'utf8');

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    console.log('1. Building Network...');
    const buildRes = await request({
        hostname: 'localhost', port: 3003, path: '/api/stormwater/network/build', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(geojsonData) }
    }, geojsonData);

    if (buildRes.statusCode !== 200) {
        console.error('Build Failed:', buildRes.body);
        return;
    }
    const net = JSON.parse(buildRes.body);
    console.log('Network ID:', net.id);

    console.log('2. Computing Risk...');
    const riskRes = await request({
        hostname: 'localhost', port: 3003, path: `/api/stormwater/network/${net.id}/risk`, method: 'GET'
    });

    console.log('Risk Status:', riskRes.statusCode);
    if (riskRes.statusCode === 200) {
        fs.writeFileSync('verification_risk_output.json', riskRes.body);
        console.log('Saved to verification_risk_output.json');
    } else {
        console.error('Risk Failed:', riskRes.body);
    }
}

run();
