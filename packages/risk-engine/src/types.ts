/**
 * @geo-lens/risk-engine
 * Core types for deterministic and probabilistic risk computation
 *
 * Design principles:
 * - NO external API calls (LLM, web services)
 * - Must work offline
 * - Extensible for future models (ML, probabilistic)
 */

/**
 * Input features for a single H3 cell
 * All fields are optional to handle missing data gracefully
 */
export interface CellFeatures {
  // Geophysical
  elevation?: number | null;          // meters above sea level
  slope?: number | null;              // degrees (0-90)
  demRoughness?: number | null;       // terrain roughness index
  aspect?: number | null;             // degrees (0-360), north=0
  curvature?: number | null;          // profile curvature

  // Landslide susceptibility
  elsusClass?: number | null;         // ELSUS class (1-5, higher=more susceptible)

  // Seismic hazard
  hazardPGA?: number | null;          // Peak Ground Acceleration (g)
  hazardPGV?: number | null;          // Peak Ground Velocity (cm/s)

  // Land cover
  clcClass?: number | null;           // Corine Land Cover class

  // Hydro-meteorological (hooks for future)
  rain24h?: number | null;            // mm in last 24h
  rain48h?: number | null;            // mm in last 48h
  rain72h?: number | null;            // mm in last 72h
  soilMoisture?: number | null;       // 0-1 saturation
  snowWaterEquivalent?: number | null; // mm

  // Geology (future hooks)
  lithology?: string | null;          // lithological unit
  permeability?: number | null;       // soil permeability class

  // Extensibility: allow custom fields
  [key: string]: number | string | boolean | null | undefined;
}

/**
 * Probabilistic risk distribution
 * All probabilities sum to 1 (within numerical precision)
 */
export interface RiskDistribution {
  /** Probability of LOW risk class (0-0.33) */
  p_low: number;

  /** Probability of MEDIUM risk class (0.33-0.67) */
  p_medium: number;

  /** Probability of HIGH risk class (0.67-1.0) */
  p_high: number;

  /** Expected value (mean) in [0, 1] */
  mean: number;

  /** Variance of distribution (for uncertainty quantification) */
  variance: number;

  /**
   * Optional: full distribution support
   * For advanced models, can store quantiles or full PDF
   */
  quantiles?: {
    p10: number;
    p25: number;
    p50: number;  // median
    p75: number;
    p90: number;
  };
}

/**
 * Risk modes (hazard types)
 */
export type RiskMode = "water" | "landslide" | "seismic" | "mineral";

/**
 * Detailed risk result with diagnostic info
 */
export interface RiskResult {
  /** The computed risk distribution */
  distribution: RiskDistribution;

  /** Which features were used in computation */
  featuresUsed: string[];

  /** Which features were missing */
  featuresMissing: string[];

  /** Confidence in the result (0-1), lower if many features missing */
  confidence: number;

  /** Optional: textual explanation of the computation */
  explanation?: string;

  /** Model version identifier */
  modelVersion: string;

  /**
   * Flag indicating this is a placeholder model
   * TRUE = model is incomplete/unvalidated, DO NOT use for real decisions
   * FALSE/undefined = model is validated for production use
   */
  isPlaceholder?: boolean;

  /**
   * Warning message for placeholder/limited models
   */
  useCaseWarning?: string;
}

/**
 * Configuration for risk computation
 */
export interface RiskConfig {
  /** Handling strategy for missing data */
  missingDataStrategy: "mean" | "conservative" | "fail";

  /** Whether to compute full quantiles (more expensive) */
  computeQuantiles: boolean;

  /** Whether to generate textual explanations */
  generateExplanations: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  missingDataStrategy: "conservative",
  computeQuantiles: false,
  generateExplanations: false
};
