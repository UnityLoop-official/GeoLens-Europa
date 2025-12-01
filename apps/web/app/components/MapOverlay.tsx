import React from 'react';
import { H3HexagonLayer, TileLayer } from '@deck.gl/geo-layers';
import { scaleLinear } from 'd3-scale';

// Compact cell format from optimized endpoint
type CompactCell = {
    i: string;   // h3Index
    w: number;   // water score
    l: number;   // landslide score
    s: number;   // seismic score
    m: number;   // mineral score
    e?: number;  // elevation (optional)
};

type Props = {
    // data prop is removed as TileLayer handles fetching
    selectedLayer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite';
    onHover: (info: any) => void;
    onClick: (info: any) => void;
};

// Color Scales
const COLOR_SCALES = {
    water: scaleLinear<string>().domain([0, 1]).range(['#E3F2FD', '#0D47A1']), // Blue
    mineral: scaleLinear<string>().domain([0, 1]).range(['#FFF8E1', '#FF6F00']), // Amber/Orange
    landslide: scaleLinear<string>().domain([0, 1]).range(['#EFEBE9', '#3E2723']), // Brown
    seismic: scaleLinear<string>().domain([0, 1]).range(['#FFEBEE', '#B71C1C']),  // Red
    satellite: scaleLinear<string>().domain([0, 1]).range(['#E3F2FD', '#0D47A1']) // Fallback to blue for satellite
};

// Helper to parse hex color to [r, g, b]
const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

export function getOverlayLayers({ selectedLayer, onHover, onClick }: Props) {
    return [
        new TileLayer({
            id: 'h3-tile-layer',
            pickable: true,
            autoHighlight: true,
            // Fetch data from backend endpoint (using working /api/h3/tile endpoint)
            getTileData: async (tile: any) => {
                const { x, y, z } = tile.index;
                const res = await fetch(`http://localhost:3003/api/h3/tile?x=${x}&y=${y}&z=${z}`);
                if (!res.ok) return [];
                const data = await res.json();
                // Transform to compact format client-side
                return data.map((cell: any) => ({
                    i: cell.h3Index,
                    w: cell.water.score,
                    l: cell.landslide.score,
                    s: cell.seismic.score,
                    m: cell.mineral.score,
                    e: cell.metadata?.elevation
                }));
            },
            // Render H3HexagonLayer for each tile
            renderSubLayers: (props) => {
                const { tile } = props;
                const { data } = props;
                // @ts-ignore
                const { x, y, z } = tile.index;

                return new H3HexagonLayer<CompactCell>({
                    id: `${props.id}-${x}-${y}-${z}`,
                    data,
                    pickable: true,
                    autoHighlight: true,
                    highlightColor: [255, 255, 255, 100],
                    wireframe: false,
                    filled: true,
                    extruded: true,
                    stroked: true, // Enable outlines
                    lineWidthMinPixels: 1,
                    lineWidthUnits: 'pixels',
                    getLineWidth: (d) => {
                        let score = 0;
                        let layerKey = selectedLayer;
                        if (selectedLayer === 'satellite') layerKey = 'water'; // Fallback

                        switch (layerKey) {
                            case 'water': score = d.w; break;
                            case 'mineral': score = d.m; break;
                            case 'landslide': score = d.l; break;
                            case 'seismic': score = d.s; break;
                        }
                        // Dynamic Border Width: Thicker for higher risk
                        // Range: 2px (Low Risk) to 6px (High Risk)
                        return 2 + (score * 4);
                    },
                    coverage: 0.85,
                    getHexagon: (d) => d.i,
                    getFillColor: (d) => {
                        let score = 0;
                        let layerKey = selectedLayer;

                        if (selectedLayer === 'satellite') {
                            layerKey = 'water';
                        }

                        switch (layerKey) {
                            case 'water': score = d.w; break;
                            case 'mineral': score = d.m; break;
                            case 'landslide': score = d.l; break;
                            case 'seismic': score = d.s; break;
                        }

                        // @ts-ignore
                        const colorHex = COLOR_SCALES[layerKey](score);
                        // Transparent Fill: Increased opacity for better visibility
                        // Alpha: 80 (more visible)
                        return [...hexToRgb(colorHex), 80];
                    },
                    getLineColor: (d) => {
                        let score = 0;
                        let layerKey = selectedLayer;

                        if (selectedLayer === 'satellite') {
                            layerKey = 'water';
                        }

                        switch (layerKey) {
                            case 'water': score = d.w; break;
                            case 'mineral': score = d.m; break;
                            case 'landslide': score = d.l; break;
                            case 'seismic': score = d.s; break;
                        }

                        // @ts-ignore
                        const colorHex = COLOR_SCALES[layerKey](score);
                        // Opaque Borders: Fully visible to define the shape and risk
                        return [...hexToRgb(colorHex), 255];
                    },
                    getElevation: (d) => {
                        const layerKey = selectedLayer === 'satellite' ? 'water' : selectedLayer;
                        switch (layerKey) {
                            case 'water': return d.w * 5000;
                            case 'mineral': return d.m * 5000;
                            case 'landslide': return d.l * 5000;
                            case 'seismic': return d.s * 5000;
                            default: return 0;
                        }
                    },
                    elevationScale: 1,
                });
            },
            // Optimization settings
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            maxRequests: 20, // Limit concurrent requests
            refinementStrategy: 'no-overlap', // Prevent Z-fighting between levels
            // Keep tiles visible while loading new ones
            keepVisble: true
        })
    ];
}
