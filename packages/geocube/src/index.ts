export interface CellScore {
    h3Index: string;

    // Water Axis
    water: {
        stress: number; // 0-1 (High stress = 1)
        recharge: number; // 0-1 (High recharge = 1)
        score: number; // Aggregate score
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
}

export const computeWaterScore = (features: CellFeatures): number => {
    // Simple logic: Low slope + specific land cover = good water potential
    const slopeScore = features.slope ? Math.max(0, 1 - features.slope / 20) : 0.5;
    return slopeScore;
};

export const computeLandslideScore = (features: CellFeatures): number => {
    // Slope + ELSUS class
    const slopeFactor = features.slope ? Math.min(1, features.slope / 45) : 0;
    const elsusFactor = features.elsusClass ? features.elsusClass / 5 : 0;
    return (slopeFactor + elsusFactor) / 2;
};

export const computeSeismicScore = (features: CellFeatures): number => {
    // PGA based
    return features.hazardPGA ? Math.min(1, features.hazardPGA * 2) : 0;
};

export const computeMineralScore = (features: CellFeatures): number => {
    // Placeholder based on CLC (e.g., Mining sites are class 7, 8, 9 in some systems, here simplified)
    return features.clcClass === 131 ? 0.9 : 0.1; // 131 = Mineral extraction sites in CLC
};
