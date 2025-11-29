/**
 * Utility functions for datacube operations
 */

import { DataPoint, DataCubeBackend, SnapshotQuery } from './types';

/**
 * CellFeatures type (imported from risk-engine conceptually, redefined here for independence)
 * This should match @geo-lens/risk-engine CellFeatures
 */
export interface CellFeatures {
  // Geophysical
  elevation?: number | null;
  slope?: number | null;
  demRoughness?: number | null;
  aspect?: number | null;
  curvature?: number | null;

  // Landslide susceptibility
  elsusClass?: number | null;

  // Seismic hazard
  hazardPGA?: number | null;
  hazardPGV?: number | null;

  // Land cover
  clcClass?: number | null;

  // Hydro-meteorological
  rain24h?: number | null;
  rain48h?: number | null;
  rain72h?: number | null;
  soilMoisture?: number | null;
  snowWaterEquivalent?: number | null;

  // Geology
  lithology?: string | null;
  permeability?: number | null;

  // Extensibility
  [key: string]: number | string | boolean | null | undefined;
}

/**
 * Variable name mapping: datacube variable → CellFeatures field
 *
 * This defines the canonical mapping between datacube layer/variable names
 * and the CellFeatures interface expected by the risk engine.
 *
 * Format: "layer:variable" → "cellFeaturesField"
 */
const VARIABLE_MAPPING: Record<string, keyof CellFeatures> = {
  // DEM layer
  'DEM:elevation': 'elevation',
  'DEM:slope': 'slope',
  'DEM:aspect': 'aspect',
  'DEM:curvature': 'curvature',
  'DEM:roughness': 'demRoughness',

  // ELSUS layer
  'ELSUS:class': 'elsusClass',
  'ELSUS:elsus_class': 'elsusClass', // Alternative naming

  // Seismic hazard layers
  'PGA:pga': 'hazardPGA',
  'PGA:pga_475yr': 'hazardPGA',
  'PGV:pgv': 'hazardPGV',
  'PGV:pgv_475yr': 'hazardPGV',
  'SEISMIC:pga': 'hazardPGA',
  'SEISMIC:pgv': 'hazardPGV',

  // Land cover
  'CLC:class': 'clcClass',
  'CLC:clc_class': 'clcClass',
  'LANDCOVER:class': 'clcClass',

  // Rainfall
  'RAIN:rain_24h': 'rain24h',
  'RAIN:rain_48h': 'rain48h',
  'RAIN:rain_72h': 'rain72h',
  'WEATHER:rain_24h': 'rain24h',
  'WEATHER:rain_48h': 'rain48h',
  'WEATHER:rain_72h': 'rain72h',

  // Soil
  'SOIL:moisture': 'soilMoisture',
  'SOIL:permeability': 'permeability',

  // Snow
  'SNOW:swe': 'snowWaterEquivalent',

  // Geology
  'GEOLOGY:lithology': 'lithology',
  'GEOLOGY:permeability': 'permeability'
};

/**
 * Build CellFeatures from datacube snapshot
 *
 * Queries the datacube for all relevant variables at a specific time
 * for a given H3 cell, and maps them to the CellFeatures interface
 * expected by the risk engine.
 *
 * @param cube - DataCube backend instance
 * @param h3Index - H3 cell index
 * @param timestamp - ISO 8601 timestamp (or "latest")
 * @param options - Optional configuration
 * @returns CellFeatures object with all available data
 *
 * @example
 * const features = await buildCellFeaturesFromDatacube(
 *   cube,
 *   "862a1073fffffff",
 *   "latest"
 * );
 *
 * const risk = computeLandslideRisk(features);
 */
export async function buildCellFeaturesFromDatacube(
  cube: DataCubeBackend,
  h3Index: string,
  timestamp: string = 'latest',
  options?: {
    /** Layers to query (default: all) */
    layers?: string[];

    /** Time tolerance in seconds (default: Infinity) */
    timeTolerance?: number;

    /** Custom variable mapping (overrides default) */
    variableMapping?: Record<string, keyof CellFeatures>;
  }
): Promise<CellFeatures> {
  const query: SnapshotQuery = {
    timestamp,
    h3Indices: [h3Index],
    layers: options?.layers,
    timeTolerance: options?.timeTolerance
  };

  const points = await cube.querySnapshot(query);

  const features: CellFeatures = {};
  const mapping = options?.variableMapping || VARIABLE_MAPPING;

  for (const point of points) {
    const key = `${point.layer}:${point.variable}`;
    const field = mapping[key];

    if (field) {
      // Type coercion: datacube values are number | string | null
      // CellFeatures expects number | string | null | undefined
      features[field] = point.value as any;
    } else {
      // Unmapped variables: store with original layer:variable name
      // This allows extensibility without breaking the schema
      features[key] = point.value as any;
    }
  }

  return features;
}

/**
 * Build CellFeatures for multiple cells in batch
 *
 * More efficient than calling buildCellFeaturesFromDatacube multiple times
 * because it issues a single datacube query.
 *
 * @param cube - DataCube backend instance
 * @param h3Indices - Array of H3 cell indices
 * @param timestamp - ISO 8601 timestamp (or "latest")
 * @param options - Optional configuration
 * @returns Map of h3Index → CellFeatures
 *
 * @example
 * const featuresMap = await buildCellFeaturesBatch(
 *   cube,
 *   ["862a1073fffffff", "862a1072fffffff"],
 *   "latest"
 * );
 *
 * for (const [h3, features] of featuresMap) {
 *   const risk = computeLandslideRisk(features);
 *   console.log(h3, risk.distribution.mean);
 * }
 */
export async function buildCellFeaturesBatch(
  cube: DataCubeBackend,
  h3Indices: string[],
  timestamp: string = 'latest',
  options?: {
    layers?: string[];
    timeTolerance?: number;
    variableMapping?: Record<string, keyof CellFeatures>;
  }
): Promise<Map<string, CellFeatures>> {
  const query: SnapshotQuery = {
    timestamp,
    h3Indices,
    layers: options?.layers,
    timeTolerance: options?.timeTolerance
  };

  const points = await cube.querySnapshot(query);

  // Group points by h3Index
  const pointsByCell = new Map<string, DataPoint[]>();
  for (const point of points) {
    if (!pointsByCell.has(point.h3Index)) {
      pointsByCell.set(point.h3Index, []);
    }
    pointsByCell.get(point.h3Index)!.push(point);
  }

  // Build features for each cell
  const result = new Map<string, CellFeatures>();
  const mapping = options?.variableMapping || VARIABLE_MAPPING;

  for (const [h3, cellPoints] of pointsByCell) {
    const features: CellFeatures = {};

    for (const point of cellPoints) {
      const key = `${point.layer}:${point.variable}`;
      const field = mapping[key];

      if (field) {
        features[field] = point.value as any;
      } else {
        features[key] = point.value as any;
      }
    }

    result.set(h3, features);
  }

  // Ensure all requested cells are in result (even if no data)
  for (const h3 of h3Indices) {
    if (!result.has(h3)) {
      result.set(h3, {});
    }
  }

  return result;
}

/**
 * Get list of all available layers in the datacube
 *
 * Useful for discovery and validation
 */
export async function getAvailableLayers(cube: DataCubeBackend): Promise<string[]> {
  const metadata = await cube.getCubeMetadata();
  return metadata.layers;
}

/**
 * Get list of all available variables in the datacube
 *
 * Useful for discovery and validation
 */
export async function getAvailableVariables(cube: DataCubeBackend): Promise<string[]> {
  const metadata = await cube.getCubeMetadata();
  return metadata.variables;
}

/**
 * Validate that required variables are present in the datacube
 *
 * Throws error if any required variable is missing
 *
 * @param cube - DataCube backend instance
 * @param requiredVars - List of "layer:variable" strings that must be present
 *
 * @example
 * await validateRequiredVariables(cube, [
 *   'DEM:elevation',
 *   'DEM:slope',
 *   'ELSUS:class',
 *   'CLC:class'
 * ]);
 */
export async function validateRequiredVariables(
  cube: DataCubeBackend,
  requiredVars: string[]
): Promise<void> {
  const metadata = await cube.getCubeMetadata();
  const availableVars = new Set(metadata.variables);

  const missing: string[] = [];

  for (const varSpec of requiredVars) {
    const [layer, variable] = varSpec.split(':');
    if (!availableVars.has(variable)) {
      missing.push(varSpec);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required variables in datacube: ${missing.join(', ')}\n` +
      `Available variables: ${Array.from(availableVars).join(', ')}`
    );
  }
}
