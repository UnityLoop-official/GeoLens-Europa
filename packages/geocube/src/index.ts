export type CellScore = {
    cellId: string;
    waterScore: number | null;
    mineralScore: number | null;
    landslideScore: number | null;
    seismicLocalScore: number | null;
    metadata?: Record<string, any>;
};
