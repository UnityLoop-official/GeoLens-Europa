import { createDataCube } from '../packages/datacube/src/index';

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('Please set DATABASE_URL environment variable');
        process.exit(1);
    }

    console.log('Connecting to Datacube (Postgres)...');
    const cube = await createDataCube({
        backend: 'postgres',
        connection: { connectionString }
    });

    console.log('Writing sample data...');
    const now = new Date().toISOString();
    await cube.writeDataPoints([
        {
            h3Index: '871e828a9ffffff',
            timestamp: now,
            layer: 'TEST_LAYER',
            variable: 'test_var',
            value: 123.45,
            unit: 'units',
            source: 'test_script',
            quality: 1.0,
            metadata: { test: true }
        }
    ]);

    console.log('Querying snapshot...');
    const snapshot = await cube.querySnapshot({
        timestamp: now,
        h3Indices: ['871e828a9ffffff'],
        layers: ['TEST_LAYER']
    });
    console.log('Snapshot result:', JSON.stringify(snapshot, null, 2));

    if (snapshot.length === 1 && snapshot[0].value === 123.45) {
        console.log('SUCCESS: Data written and retrieved correctly.');
    } else {
        console.error('FAILURE: Data mismatch.');
    }

    console.log('Cleaning up...');
    await cube.deleteDataPoints({
        h3Indices: ['871e828a9ffffff'],
        layers: ['TEST_LAYER']
    });

    await cube.close();
}

main().catch(console.error);
