import { CellScore } from '@geo-lens/geocube';

const API_URL = 'http://localhost:3001';

export const getCellData = async (lat: number, lon: number): Promise<CellScore> => {
    const res = await fetch(`${API_URL}/query/cell?lat=${lat}&lon=${lon}`);
    if (!res.ok) {
        throw new Error('Failed to fetch cell data');
    }
    return res.json();
};

export const analyzePatch = async (lat: number, lon: number): Promise<any> => {
    // Mock call to backend
    // In real app: POST /gemini/analyze-patch
    return {
        description: "AI Analysis: High water retention potential observed in satellite imagery.",
        features: ["Vegetation", "Water Body"]
    };
};
