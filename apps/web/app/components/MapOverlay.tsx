'use client';

import React from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { useControl } from 'react-map-gl/maplibre';
import { CellScore } from '@geo-lens/geocube';
import { scaleLinear } from 'd3-scale';

type Props = {
    data: CellScore[];
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

export default function MapOverlay({ data, selectedLayer, onHover, onClick }: Props) {
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
        interleaved: true,
        layers: []
    }));

    // Update layers when props change
    overlay.setProps({
        layers: [
            new H3HexagonLayer<CellScore>({
                id: 'h3-layer',
                data,
                pickable: true,
                wireframe: false,
                filled: true,
                extruded: true, // Enable 3D extrusion
                getHexagon: (d) => d.h3Index,
                getFillColor: (d) => {
                    let score = 0;
                    let layerKey = selectedLayer;

                    // If satellite, use water data but make it transparent
                    if (selectedLayer === 'satellite') {
                        layerKey = 'water';
                    }

                    switch (layerKey) {
                        case 'water': score = d.water.score; break;
                        case 'mineral': score = d.mineral.score; break;
                        case 'landslide': score = d.landslide.score; break;
                        case 'seismic': score = d.seismic.score; break;
                    }

                    // @ts-ignore - Dynamic access
                    const colorHex = COLOR_SCALES[layerKey](score);

                    // Lower opacity for satellite mode (50 vs 200)
                    const alpha = selectedLayer === 'satellite' ? 50 : 200;
                    return [...hexToRgb(colorHex), alpha];
                },
                getElevation: (d) => {
                    const layerKey = selectedLayer === 'satellite' ? 'water' : selectedLayer;
                    switch (layerKey) {
                        case 'water': return d.water.score * 5000;
                        case 'mineral': return d.mineral.score * 5000;
                        case 'landslide': return d.landslide.score * 5000;
                        case 'seismic': return d.seismic.score * 5000;
                        default: return 0;
                    }
                },
                elevationScale: 1,
                onHover,
                onClick
            })
        ]
    });

    return null;
}
