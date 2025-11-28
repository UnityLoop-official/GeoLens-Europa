import { CellFeatures } from '@geo-lens/geocube';

export type AreaRequest = {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
    resolution: number;
};

export interface DatasetAdapter {
    ensureCoverageForArea(area: AreaRequest): Promise<void>;
    sampleFeaturesForH3Cells(
        area: AreaRequest,
        h3Indices: string[]
    ): Promise<Record<string, Partial<CellFeatures>>>;
}
