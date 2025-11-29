/**
 * Mineral Resource Prospectivity Computation
 *
 * ⚠️ WARNING: CURRENT MODEL IS AN EXISTING-SITE DETECTOR ONLY ⚠️
 *
 * SCIENTIFIC BASIS (for real mineral prospectivity):
 * Proper prospectivity mapping requires:
 * 1. Geological favorability (lithology, structural controls, alteration)
 * 2. Geochemical signatures (stream sediment, soil samples, pathfinder elements)
 * 3. Geophysical anomalies (aeromagnetic, gravity, radiometric)
 * 4. Proximity to known deposits (distance decay, deposit-type models)
 * 5. Tectonic setting and metallogenic provinces
 *
 * CURRENT MODEL (v0.2.1 - PLACEHOLDER Existing-Site Detector):
 * - Uses ONLY CLC class 131 (mineral extraction sites) as binary flag
 * - Formula: prospectivity = 0.9 if CLC=131, else 0.1
 * - Rationale: CLC 131 marks active quarries/mines
 *
 * ❌ CRITICAL LIMITATIONS:
 * - ONLY identifies EXISTING extraction sites (quarries, mines)
 * - Does NOT predict undiscovered deposits
 * - Does NOT differentiate mineral types (lithium vs. gravel vs. copper)
 * - Does NOT model geological favorability
 * - Does NOT include geochemical or geophysical data
 * - Does NOT account for structural controls (faults, folds)
 * - Does NOT use proximity to known deposits
 * - Confidence artificially lowered to 0.4x to reflect inadequacy
 *
 * REQUIRED FOR PRODUCTION:
 * - Geological unit maps (lithology, age, genesis)
 * - Stream sediment geochemistry (multi-element)
 * - Aeromagnetic and gravity data
 * - Known deposit database (with deposit types, tonnage, grade)
 * - Structural geology maps (faults, lineaments)
 * - Alteration zones (from remote sensing or field mapping)
 * - Deposit-type models (porphyry, VMS, SEDEX, etc.)
 *
 * FUTURE ENHANCEMENTS:
 * - Integrate lithology-based favorability scores
 * - Distance decay from known deposits (inverse distance weighting)
 * - Fuzzy logic or Bayesian evidence integration
 * - Random forest / neural network models trained on known deposits
 * - Mineral system models (source-transport-trap paradigm)
 */

import { CellFeatures, RiskResult, RiskConfig, DEFAULT_RISK_CONFIG } from './types';
import { createDistributionFromMean, computeConfidence } from './utils';

const MODEL_VERSION = "mineral-v0.2.1-PLACEHOLDER-existing-site-detector";

// CLC class for mineral extraction sites
const CLC_MINERAL_EXTRACTION = 131;

/**
 * Compute mineral prospectivity (PLACEHOLDER MODEL)
 *
 * ⚠️ THIS IS A PLACEHOLDER - ONLY DETECTS EXISTING EXTRACTION SITES ⚠️
 *
 * @param features - Cell features
 * @param config - Risk computation configuration
 * @returns Risk result with PLACEHOLDER flag set to TRUE
 */
export function computeMineralRisk(
  features: CellFeatures,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskResult {
  const featuresUsed: string[] = [];
  const featuresMissing: string[] = [];

  // === CLC-BASED EXISTING-SITE DETECTION ===
  // If CLC = 131 (mineral extraction), mark as high prospectivity (existing site)
  // Otherwise, very low (we have NO predictive capability)
  let prospectivity = 0.1; // default: low (no site detected)

  if (features.clcClass !== null && features.clcClass !== undefined) {
    featuresUsed.push('clcClass');

    if (features.clcClass === CLC_MINERAL_EXTRACTION) {
      prospectivity = 0.9; // High: active extraction site detected
    } else {
      prospectivity = 0.1; // Low: no extraction site present
    }

  } else {
    featuresMissing.push('clcClass');

    if (config.missingDataStrategy === 'fail') {
      throw new Error('Missing required feature: clcClass');
    }

    if (config.missingDataStrategy === 'conservative') {
      prospectivity = 0.1; // Assume low if unknown
    }
  }

  // === LITHOLOGY HOOK (future - currently NOT used) ===
  // When lithology data becomes available:
  // - Certain lithologies favor certain minerals
  // - Example: granites → rare earths/tin, ultramafic → nickel/chromium/PGE
  // - Sedimentary → coal/phosphate/evaporites
  if (features.lithology !== null && features.lithology !== undefined) {
    featuresUsed.push('lithology');
    // TODO: Add lithology-based favorability scoring when data available
    // Will require lookup tables or ML models trained on deposit databases
  } else {
    featuresMissing.push('lithology');
  }

  const mean = prospectivity;

  // === DISTRIBUTION ===
  // This model has HIGH uncertainty - it's essentially binary (site vs. no-site)
  // NO modeling of geological uncertainty or deposit probability
  const variance = 0.15;
  const distribution = createDistributionFromMean(mean, variance);

  // === CONFIDENCE ===
  // ARTIFICIALLY LOWERED - this model is inadequate for prospectivity mapping
  // We're only using CLC as a crude existing-site detector
  // Even with all features present, confidence capped at 40%
  const baseConfidence = computeConfidence(featuresUsed.length, 1);
  const confidence = baseConfidence * 0.4; // 60% penalty for being a placeholder

  // === EXPLANATION ===
  let explanation: string | undefined;
  if (config.generateExplanations) {
    const clcDesc = features.clcClass !== null && features.clcClass !== undefined
      ? `CLC class ${features.clcClass}`
      : 'unknown landcover';

    if (features.clcClass === CLC_MINERAL_EXTRACTION) {
      explanation = `⚠️ PLACEHOLDER MODEL - Existing-site detector only. ` +
                    `Landcover (${clcDesc}) indicates active mineral extraction site. ` +
                    `Prospectivity=${mean.toFixed(3)}. ` +
                    `⚠️ NOT VALIDATED - does not predict undiscovered deposits. Requires geological, geochemical, and geophysical data.`;
    } else {
      explanation = `⚠️ PLACEHOLDER MODEL - Existing-site detector only. ` +
                    `Landcover (${clcDesc}) does not indicate extraction site (CLC≠131). ` +
                    `Prospectivity=${mean.toFixed(3)}. ` +
                    `⚠️ CANNOT PREDICT NEW DEPOSITS - low score does NOT mean low actual prospectivity. Geological assessment required.`;
    }
  }

  return {
    distribution,
    featuresUsed,
    featuresMissing,
    confidence,
    explanation,
    modelVersion: MODEL_VERSION,
    isPlaceholder: true, // ← CRITICAL FLAG
    useCaseWarning: "This is an existing-site detector only (CLC class 131). NOT validated for mineral prospectivity mapping. " +
                    "Cannot predict undiscovered deposits or differentiate mineral types (lithium vs. gravel vs. copper). " +
                    "Do not use for exploration planning, investment decisions, or resource assessments. " +
                    "Requires integration of geological maps, geochemical data, geophysical surveys, and deposit-type models."
  };
}

/**
 * Placeholder for future mineral-type-specific models
 *
 * ⚠️ NOT YET IMPLEMENTED - Currently returns generic existing-site detector result ⚠️
 *
 * Future implementation will support:
 * - computeTargetedMineralProspectivity(features, 'lithium') → Li-pegmatite favorability
 * - computeTargetedMineralProspectivity(features, 'copper') → Porphyry/VMS favorability
 * - computeTargetedMineralProspectivity(features, 'rare-earths') → Carbonatite/alkaline complex favorability
 *
 * Each mineral type requires different geological signatures:
 * - Lithium: Li-pegmatites (granite-hosted), lithium clays (volcanic), spodumene
 * - Copper: Porphyry (intrusive), VMS (volcanic-hosted), sediment-hosted
 * - Rare Earths: Carbonatites, alkaline complexes, ion-adsorption clays
 * - Iron: Banded iron formations (BIF), magnetite-apatite
 * - Gold: Orogenic (shear-hosted), epithermal, Carlin-type
 *
 * @param features - Cell features
 * @param _targetMineral - Target mineral type (currently ignored)
 * @param config - Risk computation configuration
 * @returns Generic existing-site detector result (NOT mineral-specific)
 */
export function computeTargetedMineralProspectivity(
  features: CellFeatures,
  _targetMineral: string, // Prefixed with _ to indicate intentionally unused
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskResult {
  // TODO: Implement deposit-type-specific prospectivity models when geological data available
  // Will require:
  // - Deposit-type recognition from lithology + geochemistry
  // - Fuzzy logic or ML models trained on known deposits of each type
  // - Pathfinder element associations (e.g., As-Sb-Hg for epithermal gold)

  // For now, just call generic existing-site detector
  const result = computeMineralRisk(features, config);

  // Add warning that mineral type is ignored
  if (config.generateExplanations && result.explanation) {
    result.explanation += ` NOTE: Target mineral type is currently ignored - model cannot differentiate deposit types.`;
  }

  return result;
}

/**
 * Alternative name for clarity - this function detects existing extraction sites,
 * NOT prospectivity for undiscovered deposits
 */
export const detectExistingMineralSites = computeMineralRisk;
