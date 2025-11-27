'use client';

import React from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { useControl } from 'react-map-gl';
import { H3CellScore } from '@geo-lens/core-geo';

type Props = {
    data: H3CellScore[];
    selectedLayer: 'water' | 'mineral' | 'landslide' | 'seismic';
    onHover: (info: any) => void;
    onClick: (info: any) => void;
};

export default function MapOverlay({ data, selectedLayer, onHover, onClick }: Props) {
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
        interleaved: true,
        layers: [
            new H3HexagonLayer<H3CellScore>({
                id: 'h3-layer',
                data,
                pickable: true,
                wireframe: false,
                filled: true,
                extruded: false,
                getHexagon: (d) => d.h3Index,
                getFillColor: (d) => {
                    const score = d.scores[selectedLayer];
                    // Simple color scale: Red (high) to Green (low) - simplified for MVP
                    // In reality use d3-scale or similar
                    const r = Math.round(score * 255);
                    const g = Math.round((1 - score) * 255);
                    return [r, g, 0, 150];
                },
                onHover,
                onClick
            })
        ]
    }));

    return null;
}
