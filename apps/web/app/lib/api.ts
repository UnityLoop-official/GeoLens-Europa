import { CellScore } from '@geo-lens/geocube';

const API_URL = 'http://localhost:3003';

export const getCellData = async (h3Index: string): Promise<CellScore> => {
    const res = await fetch(`${API_URL}/api/cell/${h3Index}`);
    if (!res.ok) throw new Error('Failed to fetch cell data');
    return res.json();
};

export const analyzePatch = async (h3Index: string, context: any) => {
    const res = await fetch(`${API_URL}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ h3Index, context })
    });
    if (!res.ok) throw new Error('Failed to analyze patch');
    return res.json();
};
