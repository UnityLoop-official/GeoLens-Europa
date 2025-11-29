/**
 * Complete Datacube Workflow Example
 *
 * Demonstrates the full lifecycle:
 * 1. Create datacube
 * 2. Ingest multi-layer data (DEM, ELSUS, PGA, CLC, RAIN)
 * 3. Query snapshots (latest data)
 * 4. Query time-series (rainfall evolution)
 * 5. Build CellFeatures for risk engine integration
 * 6. Compute risks using the integrated workflow
 *
 * This example shows how datacube enables:
 * - Separation of data storage from risk computation
 * - Time-series analysis (rainfall triggers for landslides)
 * - Multi-source data integration
 */

import {
  createDataCube,
  DataPoint,
  buildCellFeaturesFromDatacube,
  buildCellFeaturesBatch
} from '../src';

// For demonstration - in real usage, import from @geo-lens/risk-engine
interface RiskEngineCellFeatures {
  elevation?: number | null;
  slope?: number | null;
  elsusClass?: number | null;
  hazardPGA?: number | null;
  clcClass?: number | null;
  rain24h?: number | null;
  rain48h?: number | null;
  rain72h?: number | null;
  [key: string]: number | string | boolean | null | undefined;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('GeoLens Europa - Datacube Complete Workflow Example');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ========== STEP 1: Create Datacube ==========
  console.log('STEP 1: Creating in-memory datacube...');
  const cube = await createDataCube({
    backend: 'memory',
    connection: { initialCapacity: 10000 }
  });
  console.log('✓ Datacube created\n');

  // ========== STEP 2: Ingest Multi-Layer Data ==========
  console.log('STEP 2: Ingesting multi-layer geospatial data...');

  // Sample H3 cells (resolution 7, approximately 5km² per cell)
  const h3Cells = [
    '872a1070fffffff', // Cell 1
    '872a1071fffffff', // Cell 2
    '872a1072fffffff'  // Cell 3
  ];

  // Static data timestamp (DEM, ELSUS, PGA, CLC don't change frequently)
  const staticTimestamp = '2024-01-01T00:00:00Z';

  const staticData: DataPoint[] = [];

  // DEM layer (elevation, slope, aspect, etc.)
  for (const [idx, h3] of h3Cells.entries()) {
    staticData.push(
      {
        h3Index: h3,
        timestamp: staticTimestamp,
        layer: 'DEM',
        variable: 'elevation',
        value: 1200 + idx * 100, // 1200m, 1300m, 1400m
        unit: 'meters',
        source: 'Copernicus DEM 30m',
        quality: 1.0
      },
      {
        h3Index: h3,
        timestamp: staticTimestamp,
        layer: 'DEM',
        variable: 'slope',
        value: 25 + idx * 10, // 25°, 35°, 45°
        unit: 'degrees',
        source: 'Copernicus DEM 30m',
        quality: 1.0
      },
      {
        h3Index: h3,
        timestamp: staticTimestamp,
        layer: 'DEM',
        variable: 'aspect',
        value: 180 + idx * 30, // 180°, 210°, 240° (south-facing)
        unit: 'degrees',
        source: 'Copernicus DEM 30m',
        quality: 1.0
      }
    );
  }

  // ELSUS layer (landslide susceptibility)
  for (const [idx, h3] of h3Cells.entries()) {
    staticData.push({
      h3Index: h3,
      timestamp: staticTimestamp,
      layer: 'ELSUS',
      variable: 'class',
      value: 2 + idx, // ELSUS classes 2, 3, 4
      unit: 'class',
      source: 'ELSUS v2.0',
      quality: 0.8
    });
  }

  // PGA layer (seismic hazard)
  for (const [idx, h3] of h3Cells.entries()) {
    staticData.push({
      h3Index: h3,
      timestamp: staticTimestamp,
      layer: 'PGA',
      variable: 'pga_475yr',
      value: 0.15 + idx * 0.05, // 0.15g, 0.20g, 0.25g
      unit: 'g',
      source: 'EFEHR2020',
      quality: 0.9
    });
  }

  // CLC layer (land cover)
  for (const [idx, h3] of h3Cells.entries()) {
    const clcClasses = [312, 243, 111]; // Forest, agriculture, urban
    staticData.push({
      h3Index: h3,
      timestamp: staticTimestamp,
      layer: 'CLC',
      variable: 'class',
      value: clcClasses[idx],
      unit: 'class',
      source: 'CLC2018',
      quality: 1.0
    });
  }

  await cube.writeDataPoints(staticData);
  console.log(`✓ Ingested ${staticData.length} static data points (DEM, ELSUS, PGA, CLC)\n`);

  // Dynamic data: Rainfall time-series (simulating a storm event)
  console.log('Ingesting dynamic rainfall time-series...');

  const rainfallData: DataPoint[] = [];
  const startDate = new Date('2024-03-15T00:00:00Z');

  // Simulate 7 days of rainfall (3-day storm event)
  for (let day = 0; day < 7; day++) {
    const timestamp = new Date(startDate.getTime() + day * 24 * 3600 * 1000).toISOString();

    // Storm pattern: days 2-4 have high rainfall
    const isStorm = day >= 2 && day <= 4;

    for (const h3 of h3Cells) {
      const rain24h = isStorm ? 40 + Math.random() * 20 : 5 + Math.random() * 5;
      const rain48h = isStorm ? 70 + Math.random() * 30 : 10 + Math.random() * 10;
      const rain72h = isStorm ? 100 + Math.random() * 40 : 15 + Math.random() * 15;

      rainfallData.push(
        {
          h3Index: h3,
          timestamp,
          layer: 'RAIN',
          variable: 'rain_24h',
          value: rain24h,
          unit: 'mm',
          source: 'ERA5',
          quality: 0.95
        },
        {
          h3Index: h3,
          timestamp,
          layer: 'RAIN',
          variable: 'rain_48h',
          value: rain48h,
          unit: 'mm',
          source: 'ERA5',
          quality: 0.95
        },
        {
          h3Index: h3,
          timestamp,
          layer: 'RAIN',
          variable: 'rain_72h',
          value: rain72h,
          unit: 'mm',
          source: 'ERA5',
          quality: 0.95
        }
      );
    }
  }

  await cube.writeDataPoints(rainfallData);
  console.log(`✓ Ingested ${rainfallData.length} rainfall data points (7 days time-series)\n`);

  // ========== STEP 3: Query Cube Metadata ==========
  console.log('STEP 3: Querying datacube metadata...');
  const metadata = await cube.getCubeMetadata();
  console.log(`  Total data points: ${metadata.totalPoints}`);
  console.log(`  Layers: ${metadata.layers.join(', ')}`);
  console.log(`  Variables: ${metadata.variables.join(', ')}`);
  console.log(`  Spatial extent: ${metadata.spatialExtent.cellCount} cells`);
  console.log(`  Temporal extent: ${metadata.temporalExtent.startTime} to ${metadata.temporalExtent.endTime}\n`);

  // ========== STEP 4: Query Snapshot (Latest Data) ==========
  console.log('STEP 4: Querying latest snapshot for Cell 1...');
  const snapshot = await cube.querySnapshot({
    timestamp: 'latest',
    h3Indices: [h3Cells[0]],
    layers: ['DEM', 'ELSUS', 'PGA', 'CLC', 'RAIN']
  });

  console.log(`  Retrieved ${snapshot.length} data points:`);
  snapshot.forEach(p => {
    console.log(`    ${p.layer}:${p.variable} = ${p.value} ${p.unit || ''} (${p.timestamp})`);
  });
  console.log();

  // ========== STEP 5: Query Time-Series (Rainfall Evolution) ==========
  console.log('STEP 5: Querying rainfall time-series for all cells...');
  const timeSeries = await cube.queryTimeSeries({
    h3Indices: h3Cells,
    layers: ['RAIN'],
    variables: ['rain_24h'],
    timeRange: {
      startTime: '2024-03-15T00:00:00Z',
      endTime: '2024-03-21T23:59:59Z'
    }
  });

  console.log(`  Retrieved ${timeSeries.length} time-series:`);
  for (const series of timeSeries) {
    console.log(`\n  Cell ${series.h3Index} - ${series.layer}:${series.variable}`);
    console.log(`    Data points: ${series.points.length}`);
    if (series.stats) {
      console.log(`    Statistics:`);
      console.log(`      Min: ${series.stats.min.toFixed(1)} mm`);
      console.log(`      Max: ${series.stats.max.toFixed(1)} mm`);
      console.log(`      Mean: ${series.stats.mean.toFixed(1)} mm`);
      console.log(`      StdDev: ${series.stats.stddev.toFixed(1)} mm`);
    }
  }
  console.log();

  // ========== STEP 6: Build CellFeatures for Risk Engine Integration ==========
  console.log('STEP 6: Building CellFeatures for risk engine integration...');

  // Single cell
  const features1 = await buildCellFeaturesFromDatacube(cube, h3Cells[0], 'latest');
  console.log(`  Cell 1 features:`, JSON.stringify(features1, null, 2));
  console.log();

  // Batch processing (more efficient for multiple cells)
  const featuresBatch = await buildCellFeaturesBatch(cube, h3Cells, 'latest');
  console.log(`  Batch processed ${featuresBatch.size} cells:`);
  for (const [h3, features] of featuresBatch) {
    console.log(`    ${h3}: elevation=${features.elevation}m, slope=${features.slope}°, ELSUS=${features.elsusClass}, rain24h=${features.rain24h}mm`);
  }
  console.log();

  // ========== STEP 7: Demonstrate Risk Engine Integration (Conceptual) ==========
  console.log('STEP 7: Risk engine integration (conceptual)...');
  console.log('  In real usage, you would:');
  console.log('  1. Import { computeLandslideRisk, computeAllRisks } from "@geo-lens/risk-engine"');
  console.log('  2. Pass CellFeatures directly to risk computation functions');
  console.log('  3. Get back RiskResult with distribution, confidence, explanation');
  console.log();
  console.log('  Example (pseudo-code):');
  console.log('    const features = await buildCellFeaturesFromDatacube(cube, h3, "latest");');
  console.log('    const landslideRisk = computeLandslideRisk(features);');
  console.log('    const allRisks = computeAllRisks(features);');
  console.log();
  console.log('  This enables:');
  console.log('    - Time-series risk analysis (how does landslide risk evolve with rainfall?)');
  console.log('    - Multi-temporal snapshots (compare risk before/after storm)');
  console.log('    - Data provenance tracking (which data sources contributed to risk?)');
  console.log('    - Offline-first operation (no API calls, all data local)');
  console.log();

  // ========== STEP 8: Query Historical Risk Evolution ==========
  console.log('STEP 8: Demonstrating historical risk query potential...');
  console.log('  Storm peak (2024-03-17): High rainfall → elevated landslide trigger');
  const stormPeakFeatures = await buildCellFeaturesFromDatacube(
    cube,
    h3Cells[0],
    '2024-03-17T00:00:00Z'
  );
  console.log(`    rain24h=${stormPeakFeatures.rain24h}mm, rain72h=${stormPeakFeatures.rain72h}mm`);
  console.log('    → Risk engine would compute elevated landslide probability');
  console.log();

  console.log('  Post-storm (2024-03-21): Rainfall subsided');
  const postStormFeatures = await buildCellFeaturesFromDatacube(
    cube,
    h3Cells[0],
    '2024-03-21T00:00:00Z'
  );
  console.log(`    rain24h=${postStormFeatures.rain24h}mm, rain72h=${postStormFeatures.rain72h}mm`);
  console.log('    → Risk engine would compute baseline landslide probability');
  console.log();

  // ========== STEP 9: Cleanup ==========
  console.log('STEP 9: Cleaning up...');
  await cube.close();
  console.log('✓ Datacube closed\n');

  // ========== SUMMARY ==========
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✓ Datacube successfully demonstrated:');
  console.log('  1. Multi-layer data ingestion (DEM, ELSUS, PGA, CLC, RAIN)');
  console.log('  2. Time-series storage and retrieval');
  console.log('  3. Snapshot queries (latest data)');
  console.log('  4. Batch CellFeatures construction');
  console.log('  5. Risk engine integration pathway');
  console.log('  6. Historical analysis capability');
  console.log();
  console.log('✓ Phase 2 (Datacube) - COMPLETE');
  console.log();
  console.log('Next steps:');
  console.log('  - Implement SQLite/PostgreSQL backends for persistence');
  console.log('  - Adapt real ingest pipelines (DEM, ELSUS, PGA, CLC)');
  console.log('  - Integrate with /api/h3/area endpoint (Phase 3)');
  console.log('  - Add caching layer for performance');
  console.log();
}

// Run example
main().catch(console.error);
