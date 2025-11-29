/**
 * @geo-lens/datacube
 * Core types for spatio-temporal data storage
 *
 * DESIGN PRINCIPLES:
 * - H3 hexagons as spatial primitives (resolution 6-9)
 * - Time as first-class dimension (ISO 8601 timestamps)
 * - Layer-based organization (DEM, ELSUS, PGA, CLC, etc.)
 * - Variable-based access within layers
 * - Efficient querying by space, time, and layer
 * - Support for both point-in-time and time-series queries
 *
 * ARCHITECTURE:
 * - DataPoint: atomic unit (h3Index + timestamp + layer + variable + value)
 * - Snapshot: collection of DataPoints at a specific time
 * - TimeSeries: evolution of a variable over time for a cell
 * - Cube: full 3D structure (space × time × variables)
 *
 * VERSION: 0.1.0-foundation
 */

/**
 * A single data point in the spatio-temporal cube
 *
 * Represents one measurement/observation at a specific:
 * - Location (H3 cell)
 * - Time (ISO 8601 timestamp)
 * - Layer (data source/category)
 * - Variable (specific attribute)
 *
 * Example:
 * {
 *   h3Index: "862a1073fffffff",
 *   timestamp: "2024-01-15T00:00:00Z",
 *   layer: "DEM",
 *   variable: "elevation",
 *   value: 1245.5,
 *   unit: "meters",
 *   source: "Copernicus DEM 30m"
 * }
 */
export interface DataPoint {
  /** H3 cell index (string format, resolution 6-9) */
  h3Index: string;

  /**
   * Timestamp (ISO 8601 format)
   * - Static data (DEM, geology): use acquisition/publication date
   * - Dynamic data (weather, seismic): use measurement time
   * - "latest" reserved for most recent snapshot
   */
  timestamp: string;

  /**
   * Data layer identifier
   * Examples: "DEM", "ELSUS", "PGA", "CLC", "LITHOLOGY", "RAIN", "SEISMIC_EVENTS"
   */
  layer: string;

  /**
   * Variable name within the layer
   * Examples:
   * - DEM layer: "elevation", "slope", "aspect", "curvature", "roughness"
   * - ELSUS layer: "class", "confidence"
   * - PGA layer: "pga_475yr", "pga_2475yr"
   * - CLC layer: "class"
   * - RAIN layer: "rain_24h", "rain_48h", "rain_72h"
   */
  variable: string;

  /**
   * The actual value (numeric or string)
   * - Numeric: elevations, slopes, PGA values, rain amounts
   * - String: categorical classes (CLC codes, lithology types)
   * - null: missing/no data
   */
  value: number | string | null;

  /**
   * Optional: measurement unit
   * Examples: "meters", "degrees", "g" (for PGA), "mm", "class"
   */
  unit?: string;

  /**
   * Optional: data source identifier
   * Examples: "Copernicus DEM 30m", "ELSUS v2", "EFEHR2020", "CLC2018"
   */
  source?: string;

  /**
   * Optional: quality/confidence indicator (0-1)
   * - 1.0 = high quality direct measurement
   * - 0.5 = interpolated/modeled
   * - 0.0 = unreliable
   */
  quality?: number;

  /**
   * Optional: metadata (arbitrary key-value pairs)
   * For extensibility without breaking schema
   */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Query parameters for snapshot retrieval
 *
 * A "snapshot" is the state of the cube at a specific moment in time,
 * optionally filtered by spatial extent, layers, and variables.
 */
export interface SnapshotQuery {
  /**
   * Target timestamp (ISO 8601)
   * Special values:
   * - "latest": most recent data for each variable
   * - "2024-01-15T00:00:00Z": specific point in time
   */
  timestamp: string;

  /**
   * Optional: H3 cells to query
   * If omitted, queries all cells in the cube
   */
  h3Indices?: string[];

  /**
   * Optional: layers to include
   * If omitted, includes all layers
   * Examples: ["DEM", "ELSUS", "PGA"]
   */
  layers?: string[];

  /**
   * Optional: variables to include
   * If omitted, includes all variables
   * Examples: ["elevation", "slope", "elsus_class", "pga_475yr"]
   */
  variables?: string[];

  /**
   * Optional: time tolerance (in seconds)
   * For "latest" queries, how far back to look for data
   * For specific timestamps, acceptable time window
   * Default: Infinity (any available data)
   */
  timeTolerance?: number;
}

/**
 * Query parameters for time-series retrieval
 *
 * Retrieves the evolution of specific variables over time
 * for a given set of cells.
 */
export interface TimeSeriesQuery {
  /** H3 cell(s) to query */
  h3Indices: string[];

  /** Layer(s) to query */
  layers: string[];

  /** Variable(s) to query */
  variables: string[];

  /**
   * Time range
   * - startTime: ISO 8601 (inclusive)
   * - endTime: ISO 8601 (inclusive)
   * - If omitted, queries all available times
   */
  timeRange?: {
    startTime: string;
    endTime: string;
  };

  /**
   * Optional: maximum number of points per series
   * If there are more points, they will be downsampled
   */
  maxPoints?: number;
}

/**
 * Time-series result
 *
 * Contains the evolution of a variable over time for a specific cell.
 */
export interface TimeSeries {
  h3Index: string;
  layer: string;
  variable: string;
  unit?: string;
  source?: string;

  /** Time-ordered data points */
  points: Array<{
    timestamp: string;
    value: number | string | null;
    quality?: number;
  }>;

  /** Statistics (for numeric series) */
  stats?: {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    stddev: number;
  };
}

/**
 * Storage backend interface
 *
 * Datacube is agnostic to storage backend. Implementations can use:
 * - In-memory (Map-based, for testing/small datasets)
 * - SQLite (for local/embedded deployments)
 * - PostgreSQL/PostGIS (for production)
 * - DuckDB (for analytical workloads)
 * - Cloud storage (S3 + Parquet, for archival/large-scale)
 */
export interface DataCubeBackend {
  /**
   * Write data points to the cube
   * Upsert semantics: if (h3Index, timestamp, layer, variable) exists, update value
   */
  writeDataPoints(points: DataPoint[]): Promise<void>;

  /**
   * Query snapshot at a specific time
   */
  querySnapshot(query: SnapshotQuery): Promise<DataPoint[]>;

  /**
   * Query time-series for specific cells/variables
   */
  queryTimeSeries(query: TimeSeriesQuery): Promise<TimeSeries[]>;

  /**
   * Delete data points matching criteria
   * Used for data cleanup, re-ingestion
   */
  deleteDataPoints(criteria: {
    h3Indices?: string[];
    layers?: string[];
    variables?: string[];
    timeRange?: { startTime: string; endTime: string };
  }): Promise<number>; // Returns count of deleted points

  /**
   * Get metadata about the cube
   */
  getCubeMetadata(): Promise<{
    totalPoints: number;
    layers: string[];
    variables: string[];
    spatialExtent: {
      h3Resolution: number[];
      cellCount: number;
    };
    temporalExtent: {
      startTime: string;
      endTime: string;
    };
  }>;

  /**
   * Close backend connection
   */
  close(): Promise<void>;
}

/**
 * Configuration for datacube creation
 */
export interface DataCubeConfig {
  /** Storage backend type */
  backend: 'memory' | 'sqlite' | 'postgres' | 'duckdb';

  /** Backend-specific connection options */
  connection?: {
    /** For SQLite/DuckDB: file path */
    path?: string;

    /** For PostgreSQL: connection string */
    connectionString?: string;

    /** For in-memory: initial capacity hint */
    initialCapacity?: number;
  };

  /** Default H3 resolution for spatial queries */
  defaultH3Resolution?: number;

  /** Enable query caching */
  enableCache?: boolean;

  /** Cache TTL (seconds) */
  cacheTTL?: number;
}
