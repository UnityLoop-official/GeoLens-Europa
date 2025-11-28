import React from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer, TileLayer } from '@deck.gl/geo-layers';
import { useControl } from 'react-map-gl/maplibre';
import { CellScore } from '@geo-lens/geocube';
import { scaleLinear } from 'd3-scale';

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

export default function MapOverlay({ selectedLayer, onHover, onClick }: Props) {
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
        interleaved: true,
        layers: []
    }));

    // Update layers when props change
    overlay.setProps({
        layers: [
            new TileLayer({
                id: 'h3-tile-layer',
                // Fetch data from our new backend endpoint
                getTileData: async (tile: any) => {
                    const { x, y, z } = tile.index;
                    const res = await fetch(`http://localhost:3001/api/h3/tile?x=${x}&y=${y}&z=${z}`);
                    if (!res.ok) return [];
                    return res.json();
                },
                // Render H3HexagonLayer for each tile
                renderSubLayers: (props) => {
                    const { tile } = props;
                    const { data } = props;
                    // @ts-ignore
                    const { x, y, z } = tile.index;

                    return new H3HexagonLayer<CellScore>({
                        id: `${props.id}-${x}-${y}-${z}`,
                        data,
                        pickable: true,
                        wireframe: false,
                        filled: true,
                        extruded: true,
                        getHexagon: (d) => d.h3Index,
                        getFillColor: (d) => {
                            let score = 0;
                            let layerKey = selectedLayer;

                            if (selectedLayer === 'satellite') {
                                layerKey = 'water';
                            }

                            switch (layerKey) {
                                case 'water': score = d.water.score; break;
                                case 'mineral': score = d.mineral.score; break;
                                case 'landslide': score = d.landslide.score; break;
                                case 'seismic': score = d.seismic.score; break;
                            }

                            // @ts-ignore
                            const colorHex = COLOR_SCALES[layerKey](score);
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
        ]
    });

    return null;
}
