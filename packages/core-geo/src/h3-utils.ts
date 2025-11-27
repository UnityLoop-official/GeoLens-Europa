import { latLngToCell, gridDisk } from 'h3-js';

export type H3CellScore = {
    h3Index: string; // H3 index string representation
    scores: {
        water: number;    // 0-1 normalized
        mineral: number;  // 0-1 normalized
        landslide: number;// 0-1 normalized
        seismic: number;  // 0-1 normalized
    };
};

/**
 * Converts a lat/lon coordinate to an H3 index at the specified resolution.
 * @param lat Latitude
 * @param lon Longitude
 * @param res Resolution (0-15)
 * @returns H3 index string
 */
export const getCellFromLatLng = (lat: number, lon: number, res: number = 7): string => {
    return latLngToCell(lat, lon, res);
};

/**
 * Returns the k-ring neighbors of an H3 index.
 * @param h3Index Origin H3 index
 * @param radius Radius of the disk (k)
 * @returns Array of H3 indices
 */
export const getDisk = (h3Index: string, radius: number = 1): string[] => {
    return gridDisk(h3Index, radius);
};
