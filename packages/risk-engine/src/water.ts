/**
 * Water Risk / Hydrological Stress Computation
 *
 * ⚠️ WARNING: CURRENT MODEL IS A TERRAIN PROXY PLACEHOLDER ⚠️
 *
 * SCIENTIFIC BASIS (for real water stress):
 * Water stress assessment requires:
 * 1. Water supply: precipitation, groundwater recharge, surface water availability
 * 2. Water demand: population, agriculture, industry
 * 3. Seasonal variability and climate trends
 * 4. Soil water balance and infiltration capacity
 *
 * CURRENT MODEL (v0.2.1 - PLACEHOLDER Terrain Drainage Proxy):
 * - Uses ONLY terrain slope and land cover as crude proxies
 * - Formula: stress ≈ slope/20° + landcover adjustments
 * - Rationale: steep slopes → fast runoff → less infiltration
 * - Land cover effects:
 *   - Forests: +infiltration (reduce stress)
 *   - Urban: +runoff (increase stress)
 *   - Wetlands: high water availability (reduce stress)
 *
 * ❌ CRITICAL LIMITATIONS:
 * - Does NOT include precipitation data
 * - Does NOT include evapotranspiration
 * - Does NOT include actual groundwater depth
 * - Does NOT include water demand (population/agriculture)
 * - Does NOT model soil properties
 * - Confidence artificially lowered to 0.3x to reflect inadequacy
 *
 * REQUIRED FOR PRODUCTION:
 * - Precipitation climatology (monthly/annual)
 * - Soil Water Balance models
 * - Aquifer recharge maps (where available)
 * - Land use water demand estimates
 * - Groundwater depth/quality data
 *
 * FUTURE ENHANCEMENTS:
 * - Integrate rain24h, rain48h, rain72h for dynamic stress
 * - Thornthwaite or Penman-Monteith ET models
 * - GRACE satellite groundwater anomalies
 * - FAO AquaCrop or similar crop water stress indices
 */

import { CellFeatures, RiskResult, RiskConfig, DEFAULT_RISK_CONFIG } from './types';
import { createDistributionFromMean, computeConfidence, normalize, computeVarianceWithMissing } from './utils';

const MODEL_VERSION = "water-v0.2.1-PLACEHOLDER-terrain-proxy";

// Slope threshold (degrees) - above this, assume high runoff
const SLOPE_MAX = 20.0;

/**
 * Compute water stress risk (PLACEHOLDER MODEL)
 *
 * ⚠️ THIS IS A PLACEHOLDER - NOT VALIDATED FOR REAL WATER STRESS ASSESSMENT ⚠️
 *
 * @param features - Cell features
 * @param config - Risk computation configuration
 * @returns Risk result with PLACEHOLDER flag set to TRUE
 */
export function computeWaterRisk(
  features: CellFeatures,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskResult {
  const featuresUsed: string[] = [];
  const featuresMissing: string[] = [];

  // === SLOPE-BASED DRAINAGE PROXY ===
  // Higher slope → faster runoff → less infiltration → higher stress PROXY
  let stressFactor = 0.5; // default

  if (features.slope !== null && features.slope !== undefined) {
    featuresUsed.push('slope');

    // Normalize slope: 0° → 0 stress, 20°+ → 1.0 stress
    stressFactor = normalize(features.slope, 0, SLOPE_MAX);

  } else {
    featuresMissing.push('slope');

    if (config.missingDataStrategy === 'fail') {
      throw new Error('Missing required feature: slope');
    }

    if (config.missingDataStrategy === 'conservative') {
      stressFactor = 0.6; // Assume somewhat stressed if unknown
    }
  }

  // === LAND COVER ADJUSTMENT (if available) ===
  // CLC classes:
  // - Forests (311-313): +infiltration (reduce stress)
  // - Urban (111-142): +runoff (increase stress)
  // - Agricultural (211-244): neutral
  // - Wetlands (411-423): low stress
  let landCoverAdjustment = 0.0;

  if (features.clcClass !== null && features.clcClass !== undefined) {
    featuresUsed.push('clcClass');

    const clc = features.clcClass;

    // Forest classes (311-313 in CLC)
    if (clc >= 311 && clc <= 313) {
      landCoverAdjustment = -0.15; // Forests significantly reduce stress
    }

    // Scrubland/grassland (321-324)
    else if (clc >= 321 && clc <= 324) {
      landCoverAdjustment = -0.05; // Moderate reduction
    }

    // Urban classes (111-142)
    else if (clc >= 111 && clc <= 142) {
      landCoverAdjustment = +0.2; // Urban increases stress (high runoff, low recharge)
    }

    // Wetlands (411-423)
    else if (clc >= 411 && clc <= 423) {
      landCoverAdjustment = -0.3; // Wetlands = very low stress
    }

    // Water bodies (511-523)
    else if (clc >= 511 && clc <= 523) {
      landCoverAdjustment = -0.4; // Surface water = minimal stress
    }

  } else {
    featuresMissing.push('clcClass');
  }

  // === COMBINED WATER STRESS PROXY ===
  let waterStress = stressFactor + landCoverAdjustment;
  waterStress = Math.max(0, Math.min(1, waterStress)); // Clamp to [0, 1]

  // Water risk = stress (higher stress = higher risk)
  const mean = waterStress;

  // === DISTRIBUTION ===
  // High variance due to model inadequacy
  const baseVariance = 0.12; // Higher than other models
  const variance = computeVarianceWithMissing(baseVariance, featuresMissing.length);
  const distribution = createDistributionFromMean(mean, variance);

  // === CONFIDENCE ===
  // ARTIFICIALLY LOWERED - this model is inadequate
  // Even with all features present, confidence capped at 30%
  const baseConfidence = computeConfidence(featuresUsed.length, 2);
  const confidence = baseConfidence * 0.3; // 70% penalty for being a placeholder

  // === EXPLANATION ===
  let explanation: string | undefined;
  if (config.generateExplanations) {
    const slopeDesc = features.slope !== null && features.slope !== undefined
      ? `${features.slope.toFixed(1)}°`
      : 'unknown';

    const clcDesc = features.clcClass !== null && features.clcClass !== undefined
      ? `CLC class ${features.clcClass}`
      : 'unknown landcover';

    explanation = `⚠️ PLACEHOLDER MODEL - Terrain drainage proxy only. ` +
                  `Slope (${slopeDesc}) → stress factor=${stressFactor.toFixed(2)}, ` +
                  `Landcover (${clcDesc}) → adjustment=${landCoverAdjustment > 0 ? '+' : ''}${landCoverAdjustment.toFixed(2)}. ` +
                  `Final stress proxy=${mean.toFixed(3)}. ` +
                  `⚠️ NOT VALIDATED - does not include precipitation, ET, groundwater, or demand data.`;
  }

  return {
    distribution,
    featuresUsed,
    featuresMissing,
    confidence,
    explanation,
    modelVersion: MODEL_VERSION,
    isPlaceholder: true, // ← CRITICAL FLAG
    useCaseWarning: "This is a terrain drainage proxy only. NOT validated for water stress assessment. " +
                    "Do not use for water resource planning, drought risk analysis, or infrastructure decisions. " +
                    "Requires integration of precipitation, evapotranspiration, groundwater, and demand data."
  };
}

/**
 * Alternative name for clarity - this function computes terrain drainage potential,
 * NOT actual water stress
 */
export const computeTerrainDrainageProxy = computeWaterRisk;
