/**
 * Utility functions for risk computation
 */

import { RiskDistribution } from './types';

/**
 * Create a risk distribution from a mean value
 *
 * NOTE: This creates a CATEGORICAL distribution (LOW/MEDIUM/HIGH) from a continuous mean.
 * The categorical probabilities will approximate the input mean but NOT preserve it exactly.
 * This is acceptable for qualitative risk communication.
 *
 * The distribution is heuristic-based with the following properties:
 * - Probabilities sum to 1.0 (enforced by normalization)
 * - Higher mean → higher probability mass in HIGH category
 * - Supports variance parameter for future uncertainty modeling
 *
 * @param mean - Expected value in [0, 1]
 * @param variance - Variance (default 0.05) - currently not used in distribution shape but stored
 * @returns Risk distribution with probabilities summing to 1
 */
export function createDistributionFromMean(
  mean: number,
  variance: number = 0.05
): RiskDistribution {
  // Clamp mean to valid range
  mean = Math.max(0, Math.min(1, mean));

  // Simple heuristic distribution based on mean
  // Low: [0, 0.33), Medium: [0.33, 0.67), High: [0.67, 1]

  let p_low: number;
  let p_medium: number;
  let p_high: number;

  if (mean < 0.33) {
    // Mean in LOW range
    p_low = 0.7 + (0.33 - mean) * 0.5;
    p_medium = 0.25 - (0.33 - mean) * 0.3;
    p_high = 0.05;
  } else if (mean < 0.67) {
    // Mean in MEDIUM range
    const distFromCenter = Math.abs(mean - 0.5);
    p_low = 0.15 + (0.5 - mean) * 0.4;
    p_medium = 0.7 - distFromCenter * 0.6;
    p_high = 0.15 + (mean - 0.5) * 0.4;
  } else {
    // Mean in HIGH range
    p_low = 0.05;
    p_medium = 0.25 - (mean - 0.67) * 0.3;
    p_high = 0.7 + (mean - 0.67) * 0.5;
  }

  // Normalize to ensure sum = 1
  const sum = p_low + p_medium + p_high;
  p_low /= sum;
  p_medium /= sum;
  p_high /= sum;

  return {
    p_low,
    p_medium,
    p_high,
    mean,
    variance
  };
}

/**
 * Compute confidence based on feature availability
 *
 * @param featuresPresent - Number of features actually used
 * @param featuresIdeal - Number of ideal features for this model
 * @returns Confidence score in [0, 1]
 */
export function computeConfidence(
  featuresPresent: number,
  featuresIdeal: number
): number {
  if (featuresIdeal === 0) return 1.0;

  // Simple linear scaling
  const ratio = featuresPresent / featuresIdeal;

  // Clamp to [0.3, 1.0] - never go below 0.3 confidence
  return Math.max(0.3, Math.min(1.0, ratio));
}

/**
 * Normalize a value to [0, 1] range with clamping
 *
 * @param value - Input value
 * @param min - Minimum expected value (maps to 0)
 * @param max - Maximum expected value (maps to 1)
 * @returns Normalized value in [0, 1]
 */
export function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Safe division with fallback
 *
 * @param numerator
 * @param denominator
 * @param fallback - Value to return if denominator is 0
 * @returns Result or fallback
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  fallback: number = 0
): number {
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

/**
 * Compute variance adjusted for missing features
 *
 * Uncertainty increases when data is missing. This function scales
 * the base variance upward based on the number of missing features.
 *
 * Formula: variance = baseVariance * (1 + 0.5 * missingCount)
 *
 * Example:
 * - 0 missing: variance = base * 1.0
 * - 1 missing: variance = base * 1.5
 * - 2 missing: variance = base * 2.0
 *
 * @param baseVariance - Baseline variance when all features present
 * @param missingCount - Number of missing features
 * @returns Adjusted variance
 */
export function computeVarianceWithMissing(
  baseVariance: number,
  missingCount: number
): number {
  if (missingCount === 0) return baseVariance;

  // Linear scaling: +50% variance per missing feature
  const scaleFactor = 1.0 + (0.5 * missingCount);

  return baseVariance * scaleFactor;
}
