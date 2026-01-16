
const fs = require('fs');
const path = require('path');
const http = require('http');

const geojsonPath = path.join(__dirname, 'stormwater_network_example.geojson');
const geojsonData = fs.readFileSync(geojsonPath, 'utf8');

const options = {
    hostname: 'localhost',
    port: 3003,
    path: '/api/stormwater/network/build',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(geojsonData)
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
            fs.writeFileSync('verification_network.json', data);
            console.log('Output saved to verification_network.json');
        } else {
            console.error('Request failed:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(geojsonData);
req.end();
