/**
 * Seismic Risk Computation
 *
 * SCIENTIFIC BASIS:
 * Seismic risk depends on:
 * 1. Regional hazard (PGA from ESHM20)
 * 2. Local site effects (amplification due to geology/soil)
 * 3. Structural vulnerability (not modeled here - infrastructure-specific)
 *
 * CURRENT MODEL (v0.2.1 - Enhanced PGA + Site Effects):
 * - PGA-based: direct mapping from Peak Ground Acceleration
 * - Site amplification: soft soils amplify ground motion 1.5-2.5x
 * - Reference values (post-amplification):
 *   - PGA < 0.1g → LOW risk
 *   - PGA 0.1-0.3g → MODERATE risk
 *   - PGA > 0.3g → HIGH risk
 * - These thresholds align with EC8, ASCE 7-16 building code classes
 * - Variance increased to 0.15 to reflect epistemic + aleatory uncertainty
 *
 * FUTURE ENHANCEMENTS:
 * - Use full PSHA (Probabilistic Seismic Hazard Analysis) curves
 * - Add return period considerations (475yr, 2475yr events)
 * - Detailed soil classification (Vs30-based)
 * - Topographic amplification
 */

import { CellFeatures, RiskResult, RiskConfig, DEFAULT_RISK_CONFIG } from './types';
import { createDistributionFromMean, computeConfidence, normalize, computeVarianceWithMissing } from './utils';

const MODEL_VERSION = "seismic-v0.2.1-pga-site-enhanced";

// PGA thresholds (in g) - after site amplification
const PGA_LOW_THRESHOLD = 0.1;      // Below this: LOW risk
const PGA_HIGH_THRESHOLD = 0.3;     // Above this: HIGH risk
const PGA_EXTREME = 0.5;            // Normalization ceiling

// Site amplification factors
const SITE_AMPLIFICATION_ROCK = 1.0;      // Bedrock (reference)
const SITE_AMPLIFICATION_STIFF_SOIL = 1.3; // Stiff soil (Vs30: 360-800 m/s)
const SITE_AMPLIFICATION_SOFT_SOIL = 1.8;  // Soft soil (Vs30: 180-360 m/s)
// const SITE_AMPLIFICATION_VERY_SOFT = 2.5;  // Very soft soil (Vs30 < 180 m/s) - reserved for future use

// CLC classes that suggest soft soil (simplified heuristic)
const CLC_SOFT_SOIL_CLASSES = [
  411, 412, 421, 422, 423,  // Wetlands
  511, 512, 521, 522, 523   // Water bodies (sedimentary basins)
];

// CLC urban classes (may indicate fill/soft foundation)
const CLC_URBAN_CLASSES = [111, 112, 121, 122, 123, 124, 131, 132, 133, 141, 142];

export function computeSeismicRisk(
  features: CellFeatures,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskResult {
  const featuresUsed: string[] = [];
  const featuresMissing: string[] = [];

  // === PGA COMPONENT ===
  let basePGA = 0.0;
  let hasPGA = false;

  if (features.hazardPGA !== null && features.hazardPGA !== undefined) {
    hasPGA = true;
    basePGA = features.hazardPGA;
    featuresUsed.push('hazardPGA');
  } else {
    featuresMissing.push('hazardPGA');

    if (config.missingDataStrategy === 'fail') {
      throw new Error('Missing required feature: hazardPGA');
    }

    if (config.missingDataStrategy === 'conservative') {
      basePGA = 0.2; // Assume moderate-high risk if unknown (truly conservative)
    } else {
      basePGA = 0.1; // Neutral assumption
    }
  }

  // === SITE AMPLIFICATION ===
  let siteAmplification = SITE_AMPLIFICATION_ROCK; // default: assume rock
  let siteInferred = false;

  // Future: use lithology or Vs30 data if available
  if (features.lithology !== null && features.lithology !== undefined) {
    featuresUsed.push('lithology');
    // TODO: Map lithology to site class when real data available
  } else {
    featuresMissing.push('lithology');

    // HEURISTIC: Infer site class from land cover (rough proxy)
    if (features.clcClass !== null && features.clcClass !== undefined) {
      siteInferred = true;
      featuresUsed.push('clcClass');

      if (CLC_SOFT_SOIL_CLASSES.includes(features.clcClass)) {
        siteAmplification = SITE_AMPLIFICATION_SOFT_SOIL; // Wetlands/water → soft soil
      } else if (CLC_URBAN_CLASSES.includes(features.clcClass)) {
        siteAmplification = SITE_AMPLIFICATION_STIFF_SOIL; // Urban → likely fill/alluvium
      } else {
        siteAmplification = SITE_AMPLIFICATION_ROCK; // Other → assume competent ground
      }
    }
  }

  // Apply site amplification
  const amplifiedPGA = basePGA * siteAmplification;

  // Normalize to [0, 1]
  let mean = normalize(amplifiedPGA, 0, PGA_EXTREME);

  // Apply non-linear scaling to reflect damage curves
  // Power 0.8: slightly sublinear (diminishing sensitivity at extreme PGA)
  mean = Math.pow(mean, 0.8);

  // Clamp to [0, 1]
  mean = Math.max(0, Math.min(1, mean));

  // === DISTRIBUTION ===
  // Seismic hazard has HIGH inherent uncertainty (epistemic + aleatory)
  // Increased from 0.08 to 0.15 to reflect PSHA uncertainty
  const baseVariance = 0.15;
  const variance = computeVarianceWithMissing(baseVariance, featuresMissing.length);
  const distribution = createDistributionFromMean(mean, variance);

  // === CONFIDENCE ===
  // Ideal features: hazardPGA + lithology/Vs30
  let confidence = computeConfidence(featuresUsed.length, 2);

  // Reduce confidence if site class was inferred from CLC (rough proxy)
  if (siteInferred) {
    confidence *= 0.7; // 30% penalty for CLC-based site inference
  }

  // === EXPLANATION ===
  let explanation: string | undefined;
  if (config.generateExplanations) {
    const pgaDesc = hasPGA ? `${basePGA.toFixed(3)}g` : 'unknown';
    const amplifiedPGADesc = `${amplifiedPGA.toFixed(3)}g`;
    const siteDesc = siteInferred
      ? `inferred from landcover (factor=${siteAmplification.toFixed(1)}x)`
      : `${siteAmplification.toFixed(1)}x`;

    const riskClass = classifyPGA(amplifiedPGA);

    explanation = `Seismic risk: Base PGA=${pgaDesc}, Site amplification=${siteDesc}, ` +
                  `Amplified PGA=${amplifiedPGADesc}. ` +
                  `Risk class: ${riskClass}. ` +
                  `Mean risk score=${mean.toFixed(3)}.`;

    if (siteAmplification > SITE_AMPLIFICATION_ROCK) {
      explanation += ` NOTE: Site effects applied - soft soils amplify ground motion.`;
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

/**
 * Classify PGA into standard risk classes
 * Useful for reporting
 *
 * @param pga - Peak Ground Acceleration (g) - should be AFTER site amplification
 */
export function classifyPGA(pga: number): 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' {
  if (pga < PGA_LOW_THRESHOLD) return 'LOW';
  if (pga < PGA_HIGH_THRESHOLD) return 'MODERATE';
  if (pga < PGA_EXTREME) return 'HIGH';
  return 'VERY_HIGH';
}
