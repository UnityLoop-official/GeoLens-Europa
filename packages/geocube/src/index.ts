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
