/**
 * @geo-lens/geocube
 *
 * Domain types and legacy compatibility layer for risk scoring
 *
 * VERSION 0.2.0:
 * - All scoring logic now delegated to @geo-lens/risk-engine
 * - This package maintains backward compatibility and domain types
 * - For new code, use @geo-lens/risk-engine directly
 */

import {
    computeSimpleScores,
    CellFeatures as RiskEngineCellFeatures
} from '@geo-lens/risk-engine';

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export interface CellScore {
    h3Index: string;

    // Water Axis
    water: {
        stress: number; // 0-1 (High stress = 1)
        recharge: number; // 0-1 (High recharge = 1)
        score: number; // Aggregate score
        rain24h?: number; // Precipitation in last 24h (mm)
        rain72h?: number; // Precipitation in last 72h (mm)
    };

    // Mass Movement Axis
    landslide: {
        susceptibility: number; // 0-1
        history: boolean; // True if historical events present
        score: number;
    };

    // Seismic Axis
    seismic: {
        pga: number; // Peak Ground Acceleration
        class: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
        score: number;
    };

    // Resources Axis
    mineral: {
        prospectivity: number; // 0-1
        type: string; // e.g., "Lithium", "Copper", "None"
        score: number;
    };

    metadata: {
        lat: number;
        lon: number;
        elevation: number;
        biome: string;
    };
}

export const calculateAggregateScore = (cell: CellScore): number => {
    return (cell.water.score + cell.landslide.score + cell.seismic.score + cell.mineral.score) / 4;
};

export interface CellFeatures {
    h3Index: string;
    elevation?: number;
    slope?: number;
    elsusClass?: number;
    hazardPGA?: number;
    clcClass?: number;
    // Allow extensibility like risk-engine's CellFeatures
    [key: string]: number | string | boolean | null | undefined;
}

// ============================================================================
// BACKWARD-COMPATIBLE SCORE FUNCTIONS
// All delegate to @geo-lens/risk-engine
// ============================================================================

/**
 * @deprecated Use computeWaterRisk from @geo-lens/risk-engine instead
 * Kept for backward compatibility
 */
export const computeWaterScore = (features: CellFeatures): number => {
    const scores = computeSimpleScores(features as RiskEngineCellFeatures);
    return scores.waterScore;
};

/**
 * @deprecated Use computeLandslideRisk from @geo-lens/risk-engine instead
 * Kept for backward compatibility
 */
export const computeLandslideScore = (features: CellFeatures): number => {
    const scores = computeSimpleScores(features as RiskEngineCellFeatures);
    return scores.landslideScore;
};

/**
 * @deprecated Use computeSeismicRisk from @geo-lens/risk-engine instead
 * Kept for backward compatibility
 */
export const computeSeismicScore = (features: CellFeatures): number => {
    const scores = computeSimpleScores(features as RiskEngineCellFeatures);
    return scores.seismicScore;
};

/**
 * @deprecated Use computeMineralRisk from @geo-lens/risk-engine instead
 * Kept for backward compatibility
 */
export const computeMineralScore = (features: CellFeatures): number => {
    const scores = computeSimpleScores(features as RiskEngineCellFeatures);
    return scores.mineralScore;
};
