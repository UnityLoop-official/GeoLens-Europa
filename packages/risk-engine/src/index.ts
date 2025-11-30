/**
 * @geo-lens/risk-engine
 *
 * Deterministic and probabilistic risk computation engine for GeoLens Europa
 *
 * DESIGN PRINCIPLES:
 * - NO external API calls (fully offline-capable)
 * - NO AI/LLM dependencies
 * - Transparent, documented formulas
 * - Extensible for future model improvements
 * - Handles missing data gracefully
 *
 * VERSION: 0.2.0-heuristic
 * - All models use heuristic/empirical formulas
 * - Future: replace with calibrated statistical/ML models
 *
 * USAGE:
 * ```typescript
 * import { computeLandslideRisk, CellFeatures } from '@geo-lens/risk-engine';
 *
 * const features: CellFeatures = {
 *   slope: 35.0,
 *   elsusClass: 4,
 *   hazardPGA: 0.25
 * };
 *
 * const result = computeLandslideRisk(features);
 * console.log(result.distribution.mean); // 0.7
 * console.log(result.confidence); // 1.0 (all features present)
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================
export type {
  CellFeatures,
  RiskDistribution,
  RiskResult,
  RiskConfig,
  RiskMode
} from './types';

export { DEFAULT_RISK_CONFIG } from './types';

// ============================================================================
// CORE RISK COMPUTATION FUNCTIONS
// ============================================================================

/** Compute landslide risk from cell features */
export { computeLandslideRisk } from './landslide';

/** Compute seismic risk from cell features */
export { computeSeismicRisk, classifyPGA } from './seismic';

/** Compute water stress risk from cell features (PRODUCTION MODEL with real precipitation) */
export { computeWaterRisk, computeWaterScore } from './waterProduction';

/** Legacy terrain drainage proxy (PLACEHOLDER MODEL) */
export { computeWaterRisk as computeWaterRiskLegacy, computeTerrainDrainageProxy } from './water';

/** Compute mineral prospectivity from cell features (PLACEHOLDER MODEL) */
export { computeMineralRisk, computeTargetedMineralProspectivity, detectExistingMineralSites } from './mineral';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export {
  createDistributionFromMean,
  computeConfidence,
  computeVarianceWithMissing,
  normalize,
  safeDivide
} from './utils';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { CellFeatures, RiskResult, RiskConfig, DEFAULT_RISK_CONFIG } from './types';
import { computeLandslideRisk } from './landslide';
import { computeSeismicRisk } from './seismic';
import { computeWaterRisk } from './waterProduction';
import { computeMineralRisk } from './mineral';

/**
 * Compute ALL risk types for a cell in one call
 *
 * @param features - Cell features
 * @param config - Risk computation configuration
 * @returns Object with all risk results
 */
export function computeAllRisks(
  features: CellFeatures,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): {
  landslide: RiskResult;
  seismic: RiskResult;
  water: RiskResult;
  mineral: RiskResult;
} {
  return {
    landslide: computeLandslideRisk(features, config),
    seismic: computeSeismicRisk(features, config),
    water: computeWaterRisk(features, config),
    mineral: computeMineralRisk(features, config)
  };
}

/**
 * Extract simple mean scores for backward compatibility
 * Maps new RiskResult to legacy score format
 *
 * @param features - Cell features
 * @returns Object with simple scores (0-1)
 */
export function computeSimpleScores(features: CellFeatures): {
  waterScore: number;
  landslideScore: number;
  seismicScore: number;
  mineralScore: number;
} {
  const config: RiskConfig = {
    ...DEFAULT_RISK_CONFIG,
    generateExplanations: false,  // Skip for performance
    computeQuantiles: false
  };

  const risks = computeAllRisks(features, config);

  return {
    waterScore: risks.water.distribution.mean,
    landslideScore: risks.landslide.distribution.mean,
    seismicScore: risks.seismic.distribution.mean,
    mineralScore: risks.mineral.distribution.mean
  };
}
