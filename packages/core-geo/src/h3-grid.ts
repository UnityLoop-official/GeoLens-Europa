import { polygonToCells, cellToLatLng, latLngToCell } from 'h3-js';

// Approximate polygon for Europe (Simplified)
// Coordinates are [lat, lon]
const EUROPE_POLYGON = [
    [35.0, -10.0], // SW
    [70.0, -10.0], // NW
    [70.0, 30.0],  // NE
    [35.0, 30.0],  // SE
    [35.0, -10.0]  // Close loop
];

/**
 * Generates H3 cells covering Europe at the specified resolution.
 * @param resolution H3 resolution (0-15)
 * @returns Array of H3 indices
 */
export function generateH3GridForEurope(resolution: number): string[] {
    // Note: polygonToCells expects [lat, lon] pairs by default (isGeoJson=false)
    return polygonToCells(EUROPE_POLYGON, resolution);
}

/**
 * Generates H3 cells covering a Bounding Box.
 * @param bbox { west, south, east, north }
 * @param resolution H3 resolution
 * @returns Array of H3 indices
 */
export function getCellsForBbox(bbox: { west: number, south: number, east: number, north: number }, resolution: number): string[] {
    const polygon = [
        [bbox.south, bbox.west],
        [bbox.north, bbox.west],
        [bbox.north, bbox.east],
        [bbox.south, bbox.east],
        [bbox.south, bbox.west]
    ];

    const cells = polygonToCells(polygon, resolution); // Default is [lat, lon]

    if (cells.length === 0) {
        // Fallback: If bbox is too small, get the center cell
        const centerLat = (bbox.south + bbox.north) / 2;
        const centerLon = (bbox.west + bbox.east) / 2;
        const centerCell = latLngToCell(centerLat, centerLon, resolution);
        return [centerCell];
    }
    return cells;
}

/**
 * Converts an H3 index to its center Lat/Lon.
 * @param h3Index H3 Index
 * @returns { lat, lon }
 */
export function h3ToLatLon(h3Index: string): { lat: number; lon: number } {
    const [lat, lon] = cellToLatLng(h3Index);
    return { lat, lon };
}
