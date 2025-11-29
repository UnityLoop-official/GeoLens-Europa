/**
 * Landslide Risk Computation
 *
 * SCIENTIFIC BASIS:
 * Landslide susceptibility depends primarily on:
 * 1. Slope angle (mechanical stability)
 * 2. Geological susceptibility (ELSUS classification)
 * 3. Precipitation (trigger - future)
 * 4. Soil moisture (future)
 *
 * CURRENT MODEL (v0.2.1 - Enhanced Heuristic):
 * - Slope component:
 *   - 0-45°: linear scaling (angle of repose)
 *   - >45°: accelerated non-linear growth (extreme instability)
 * - ELSUS component: ELSUS classes 1-5 normalized
 * - Conditional defaults: missing ELSUS inferred from slope when available
 * - Variance scales with missing features
 *
 * FUTURE ENHANCEMENTS:
 * - Incorporate rainfall triggers (rain24h, rain48h, rain72h)
 * - Use statistical models from historical landslide inventory
 * - Add lithology-based corrections
 * - Curvature and aspect effects
 */

import { CellFeatures, RiskDistribution, RiskResult, RiskConfig, DEFAULT_RISK_CONFIG } from './types';
import { createDistributionFromMean, computeConfidence, computeVarianceWithMissing } from './utils';

const MODEL_VERSION = "landslide-v0.2.1-enhanced-heuristic";

// Slope thresholds and parameters
const SLOPE_LINEAR_THRESHOLD = 45.0;  // degrees - angle of repose
const SLOPE_EXTREME_MAX = 70.0;       // degrees - beyond this, treat as near-vertical
const SLOPE_EXTREME_BOOST = 0.3;      // boost factor for slopes >45°

/**
 * Compute landslide risk from cell features
 *
 * @param features - Cell features
 * @param config - Risk computation configuration
 * @returns Detailed risk result with distribution
 */
export function computeLandslideRisk(
  features: CellFeatures,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskResult {
  const featuresUsed: string[] = [];
  const featuresMissing: string[] = [];

  // === SLOPE COMPONENT ===
  // Physical basis: steeper slopes → higher instability
  // Enhanced model: non-linear growth for slopes >45°
  let slopeFactor = 0.5; // default if missing (conservative middle value)
  let hasSlope = false;
  let actualSlope: number | null = null;

  if (features.slope !== null && features.slope !== undefined) {
    hasSlope = true;
    actualSlope = features.slope;
    featuresUsed.push('slope');

    if (features.slope <= 0) {
      // Flat or invalid
      slopeFactor = 0.0;
    } else if (features.slope <= SLOPE_LINEAR_THRESHOLD) {
      // Linear regime: 0-45° → 0.0-1.0
      slopeFactor = features.slope / SLOPE_LINEAR_THRESHOLD;
    } else {
      // Non-linear regime: >45° → accelerated growth
      // At 45°: slopeFactor = 1.0
      // At 70°: slopeFactor = 1.0 + 0.3 = 1.3 (clamped later)
      const excessSlope = Math.min(features.slope - SLOPE_LINEAR_THRESHOLD, SLOPE_EXTREME_MAX - SLOPE_LINEAR_THRESHOLD);
      const excessRatio = excessSlope / (SLOPE_EXTREME_MAX - SLOPE_LINEAR_THRESHOLD);
      slopeFactor = 1.0 + (SLOPE_EXTREME_BOOST * excessRatio);
    }

    // Clamp to [0, 1.3] - allow exceeding 1.0 for extreme slopes
    slopeFactor = Math.max(0, Math.min(1.3, slopeFactor));

  } else {
    featuresMissing.push('slope');
    if (config.missingDataStrategy === 'fail') {
      throw new Error('Missing required feature: slope');
    }
    if (config.missingDataStrategy === 'conservative') {
      slopeFactor = 0.5; // assume moderate slope
    }
  }

  // === ELSUS COMPONENT ===
  // ELSUS (European Landslide Susceptibility) classes: 1-5
  // 1 = very low, 5 = very high
  // Formula: (elsusClass - 1) / 4 to normalize to [0,1]
  let elsusFactor = 0.5; // default
  let elsusInferred = false;

  if (features.elsusClass !== null && features.elsusClass !== undefined) {
    featuresUsed.push('elsusClass');
    // Normalize ELSUS class 1-5 to [0,1]
    elsusFactor = Math.max(0, Math.min(1, (features.elsusClass - 1) / 4));
  } else {
    featuresMissing.push('elsusClass');

    // CONDITIONAL DEFAULT: Infer ELSUS from slope if available
    if (hasSlope && actualSlope !== null) {
      elsusInferred = true;
      if (actualSlope < 10) {
        // Very low slope → likely low ELSUS
        elsusFactor = 0.1; // ~ELSUS class 1.4
      } else if (actualSlope < 20) {
        // Low-moderate slope
        elsusFactor = 0.3; // ~ELSUS class 2.2
      } else if (actualSlope < 30) {
        // Moderate slope
        elsusFactor = 0.5; // ~ELSUS class 3
      } else if (actualSlope < 40) {
        // High slope
        elsusFactor = 0.7; // ~ELSUS class 3.8
      } else {
        // Very high slope → likely high ELSUS
        elsusFactor = 0.85; // ~ELSUS class 4.4
      }
    } else {
      // No slope data either - use strategy default
      if (config.missingDataStrategy === 'conservative') {
        elsusFactor = 0.6; // Assume somewhat high if completely unknown
      } else {
        elsusFactor = 0.5; // Neutral
      }
    }
  }

  // === COMBINED SCORE ===
  // Weighted average: slope (60%) + ELSUS (40%)
  // Rationale: slope is fundamental physics, ELSUS encodes historical/geological knowledge
  const SLOPE_WEIGHT = 0.6;
  const ELSUS_WEIGHT = 0.4;

  let mean = (SLOPE_WEIGHT * slopeFactor) + (ELSUS_WEIGHT * elsusFactor);

  // Clamp final mean to [0, 1]
  mean = Math.max(0, Math.min(1, mean));

  // === DISTRIBUTION ===
  // Variance scales with missing features
  const baseVariance = 0.05;
  const variance = computeVarianceWithMissing(baseVariance, featuresMissing.length);
  const distribution = createDistributionFromMean(mean, variance);

  // === CONFIDENCE ===
  let confidence = computeConfidence(featuresUsed.length, 2); // 2 ideal features (slope, elsus)

  // Reduce confidence if ELSUS was inferred rather than measured
  if (elsusInferred) {
    confidence *= 0.8; // 20% penalty for inference
  }

  // === EXPLANATION ===
  let explanation: string | undefined;
  if (config.generateExplanations) {
    const slopeDesc = actualSlope !== null ? `${actualSlope.toFixed(1)}°` : 'unknown';
    const elsusDesc = features.elsusClass !== null && features.elsusClass !== undefined
      ? `class ${features.elsusClass}/5`
      : elsusInferred
        ? `inferred from slope (~${(elsusFactor * 4 + 1).toFixed(1)}/5)`
        : 'unknown';

    explanation = `Landslide risk computed from slope (${slopeDesc}) and ELSUS (${elsusDesc}). ` +
                  `Slope factor=${slopeFactor.toFixed(3)}, ELSUS factor=${elsusFactor.toFixed(3)}. ` +
                  `Mean risk=${mean.toFixed(3)} (${getRiskClass(mean)}).`;

    if (actualSlope !== null && actualSlope > SLOPE_LINEAR_THRESHOLD) {
      explanation += ` WARNING: Extreme slope (>${SLOPE_LINEAR_THRESHOLD}°) - non-linear risk amplification applied.`;
    }
  }

  return {
    distribution,
    featuresUsed,
    featuresMissing,
    confidence,
    explanation,
    modelVersion: MODEL_VERSION
  };
}

function getRiskClass(mean: number): string {
  if (mean < 0.33) return 'LOW';
  if (mean < 0.67) return 'MEDIUM';
  return 'HIGH';
}
