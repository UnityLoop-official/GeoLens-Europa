/**
 * @geo-lens/datacube
 *
 * Spatio-temporal data cube for GeoLens Europa
 *
 * DESIGN PRINCIPLES:
 * - H3 hexagons as spatial primitives
 * - Time as first-class dimension
 * - Layer-based organization (DEM, ELSUS, PGA, CLC, etc.)
 * - Multiple backend support (memory, SQLite, PostgreSQL, DuckDB)
 * - Efficient queries by space, time, and variables
 *
 * VERSION: 0.1.0-foundation
 *
 * USAGE:
 * ```typescript
 * import { createDataCube } from '@geo-lens/datacube';
 *
 * // Create in-memory cube
 * const cube = await createDataCube({ backend: 'memory' });
 *
 * // Write data
 * await cube.writeDataPoints([
 *   {
 *     h3Index: "862a1073fffffff",
 *     timestamp: "2024-01-15T00:00:00Z",
 *     layer: "DEM",
 *     variable: "elevation",
 *     value: 1245.5,
 *     unit: "meters"
 *   }
 * ]);
 *
 * // Query snapshot
 * const snapshot = await cube.querySnapshot({
 *   timestamp: "latest",
 *   h3Indices: ["862a1073fffffff"],
 *   layers: ["DEM", "ELSUS"]
 * });
 *
 * // Query time-series
 * const series = await cube.queryTimeSeries({
 *   h3Indices: ["862a1073fffffff"],
 *   layers: ["RAIN"],
 *   variables: ["rain_24h"],
 *   timeRange: {
 *     startTime: "2024-01-01T00:00:00Z",
 *     endTime: "2024-01-31T23:59:59Z"
 *   }
 * });
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================
export type {
  DataPoint,
  SnapshotQuery,
  TimeSeriesQuery,
  TimeSeries,
  DataCubeBackend,
  DataCubeConfig
} from './types';

// ============================================================================
// BACKENDS
// ============================================================================
export { PostgresBackend } from './backends/postgres';

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

import { DataCubeBackend, DataCubeConfig } from './types';
import { MemoryDataCube } from './backends/memory';
import { PostgresBackend } from './backends/postgres';

/**
 * Create a DataCube instance with the specified backend
 *
 * @param config - Datacube configuration
 * @returns DataCube backend instance
 *
 * @example
 * // In-memory (for testing, small datasets)
 * const cube = await createDataCube({ backend: 'memory' });
 *
 * @example
 * // SQLite (for local/embedded)
 * const cube = await createDataCube({
 *   backend: 'sqlite',
 *   connection: { path: './geolens.db' }
 * });
 *
 * @example
 * // PostgreSQL (for production)
 * const cube = await createDataCube({
 *   backend: 'postgres',
 *   connection: {
 *     connectionString: 'postgresql://user:pass@localhost:5432/geolens'
 *   }
 * });
 */
export async function createDataCube(config: DataCubeConfig): Promise<DataCubeBackend> {
  switch (config.backend) {
    case 'memory':
      return new MemoryDataCube(config.connection?.initialCapacity);

    case 'sqlite':
      // TODO: Implement SQLite backend
      throw new Error('SQLite backend not yet implemented. Use "memory" for now.');

    case 'postgres':
      const pgBackend = new PostgresBackend(config);
      await pgBackend.initialize();
      return pgBackend;

    case 'duckdb':
      // TODO: Implement DuckDB backend
      throw new Error('DuckDB backend not yet implemented. Use "memory" for now.');

    default:
      throw new Error(`Unknown backend: ${config.backend}`);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export {
  buildCellFeaturesFromDatacube,
  buildCellFeaturesBatch,
  getAvailableLayers,
  getAvailableVariables,
  validateRequiredVariables
} from './utils';
