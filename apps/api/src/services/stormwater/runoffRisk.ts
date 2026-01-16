
/**
 * Stormwater Runoff Risk Calculation
 * 
 * Computes runoff risk based on:
 * 1. Precipitation Volume (rain24h)
 * 2. Surface Imperviousness (CLC Class proxy)
 * 3. Slope (Terrain steepness)
 */

export interface RunoffInput {
    rain24h_mm: number;
    clcClass: number; // CLC Code (111-523)
    slope_deg: number;
}

export interface RunoffResult {
    riskScore: number; // 0.0 - 1.0
    riskClass: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | 'N/A';
    factors: {
        rain: number;
        impervious: number;
        slope: number;
    };
}

/**
 * Map CLC Class to Imperviousness Factor (0.0 - 1.0)
 * 1xx: Artificial surfaces -> High (0.8 - 1.0)
 * 2xx: Agricultural areas -> Moderate (0.3 - 0.6)
 * 3xx: Forest and seminatural -> Low (0.1 - 0.3)
 * 4xx: Wetlands -> Variable (assume 0.2 for saturation buffer)
 * 5xx: Water bodies -> N/A (Direct water)
 */
function getImperviousness(clcCode: number): number | null {
    if (!clcCode) return 0.5; // Default middle ground if missing

    if (clcCode >= 100 && clcCode < 200) return 0.9; // Urban/Artificial
    if (clcCode >= 200 && clcCode < 300) return 0.4; // Agriculture
    if (clcCode >= 300 && clcCode < 400) return 0.15; // Forests
    if (clcCode >= 400 && clcCode < 500) return 0.2; // Wetlands - Default Low
    if (clcCode >= 500) return null; // Water body - N/A for risk

    return 0.5;
}

function getRainFactor(rainMm: number): number {
    // 0mm -> 0
    // 50mm -> 1.0 (Heavy rain threshold)
    return Math.min(rainMm / 50.0, 1.0);
}

function getSlopeFactor(deg: number): number {
    // 0 deg -> 0
    // 20 deg -> 1.0 (Steep)
    return Math.min(deg / 20.0, 1.0);
}

export function computeRunoffRisk(input: RunoffInput): RunoffResult | null {
    let imp = getImperviousness(input.clcClass);

    // If water body, return null (N/A)
    if (imp === null) return null;

    // Wetlands Saturation Logic: If rain > 30mm, increase imperviousness
    if (input.clcClass >= 400 && input.clcClass < 500 && input.rain24h_mm > 30) {
        imp = 0.8; // Saturated wetland acts like impervious
    }

    const rainF = getRainFactor(input.rain24h_mm);
    const slopeF = getSlopeFactor(input.slope_deg);

    // Risk Formula (MVP):
    // Risk = Rain * (0.6 * Impervious + 0.4 * Slope)
    // Rationale: Imperviousness is the primary driver for surface runoff volume, slope adds velocity/intensity.
    const riskScore = Math.min(rainF * (0.6 * imp + 0.4 * slopeF) * 2.0, 1.0); // * 2.0 to boost sensitivity for MVP? 
    // Let's stick to simpler: Risk = Rain * Impervious * (1 + Slope) normalized?
    // Let's use weighted sum of normalized factors:
    // Risk = (Rain * 0.5) + (Impervious * 0.3) + (Slope * 0.2)
    // BUT user asked: "Rain * CLC_Impervious * Slope"?
    // "Logic: Rain * CLC_Impervious * Slope" -> This implies multiplicative.
    // Normalized inputs: 
    // Rain=1.0 (50mm), Imp=0.9 (Urban), Slope=0.1 (3deg) -> 0.09 (Too low?)
    // Let's adjust Slope normalization for multiplicative. 
    // Slope Factor multiplier: 1.0 (flat) to 2.0 (steep)?

    // User requested "Rain * CLC_Impervious * Slope". Let's try to interpret "Slope" as a factor.
    // If Slope is raw degrees, 10 * 0.9 * 50 = 450. Too big.
    // If factors 0..1: 1.0 * 1.0 * 1.0 = 1.0. 
    // 50mm Rain (1.0) * Urban (0.9) * 30deg Slope (1.0) = 0.9 (Extreme Risk)
    // 10mm Rain (0.2) * Urban (0.9) * 0deg Slope (min 0.1?) = ...

    // Revised Slope Factor for multiplicative: 
    // 0 deg -> 0.5 (Base)
    // 30 deg -> 1.5 (Enhancer)
    const slopeMulti = 0.5 + (Math.min(input.slope_deg, 30) / 30.0);

    const rawScore = rainF * imp * slopeMulti;
    const finalScore = Math.min(rawScore, 1.0);

    let riskClass: RunoffResult['riskClass'] = 'LOW';
    if (finalScore > 0.8) riskClass = 'EXTREME';
    else if (finalScore > 0.5) riskClass = 'HIGH';
    else if (finalScore > 0.2) riskClass = 'MODERATE';

    return {
        riskScore: Number(finalScore.toFixed(3)),
        riskClass,
        factors: {
            rain: Number(rainF.toFixed(2)),
            impervious: Number(imp.toFixed(2)),
            slope: Number(slopeMulti.toFixed(2))
        }
    };
}
