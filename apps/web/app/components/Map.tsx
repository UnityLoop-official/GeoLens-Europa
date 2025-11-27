'use client';

import React, { useEffect, useRef, useState } from 'react';
import Map, { NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getCellData, analyzePatch } from '../lib/api';
import { CellScore } from '@geo-lens/geocube';
import { H3CellScore, getCellFromLatLng, getDisk } from '@geo-lens/core-geo';
import MapOverlay from './MapOverlay';

// Mock H3 Data generator
const generateMockH3Data = (lat: number, lon: number): H3CellScore[] => {
    const centerH3 = getCellFromLatLng(lat, lon, 7);
    const neighbors = getDisk(centerH3, 5); // 5-ring neighborhood
    return neighbors.map(h3Index => ({
        h3Index,
        scores: {
            water: Math.random(),
            mineral: Math.random(),
            landslide: Math.random(),
            seismic: Math.random()
        }
    }));
};

export default function MapView() {
    const [viewState, setViewState] = useState({
        longitude: 12.5,
        latitude: 41.9,
        zoom: 6
    });
    const [selectedLayer, setSelectedLayer] = useState<'water' | 'mineral' | 'landslide' | 'seismic'>('water');
    const [h3Data, setH3Data] = useState<H3CellScore[]>([]);
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [selectedCell, setSelectedCell] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load initial mock data
        setH3Data(generateMockH3Data(41.9, 12.5));
    }, []);

    const onHover = (info: any) => {
        setHoverInfo(info);
    };

    const onClick = async (info: any) => {
        if (info.object) {
            setSelectedCell(info.object);
            setAnalysis(null);
            // In real app, fetch detailed data for this H3 index
        }
    };

    return (
        <div className="relative w-full h-full">
            <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: '100%', height: '100%' }}
                mapStyle="https://demotiles.maplibre.org/style.json"
            >
                <NavigationControl position="top-right" />
                <MapOverlay
                    data={h3Data}
                    selectedLayer={selectedLayer}
                    onHover={onHover}
                    onClick={onClick}
                />
            </Map>

            {/* Layer Control */}
            <div className="absolute top-4 left-4 bg-white p-2 rounded shadow z-10 flex gap-2">
                {(['water', 'mineral', 'landslide', 'seismic'] as const).map(layer => (
                    <button
                        key={layer}
                        onClick={() => setSelectedLayer(layer)}
                        className={`px-3 py-1 rounded text-sm capitalize ${selectedLayer === layer ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                    >
                        {layer}
                    </button>
                ))}
            </div>

            {/* Tooltip */}
            {hoverInfo && hoverInfo.object && (
                <div className="absolute bg-black text-white p-2 rounded text-xs pointer-events-none z-20" style={{ left: hoverInfo.x, top: hoverInfo.y }}>
                    <div>H3: {hoverInfo.object.h3Index}</div>
                    <div>Score: {hoverInfo.object.scores[selectedLayer].toFixed(2)}</div>
                </div>
            )}

            {/* Side Panel */}
            {selectedCell && (
                <div className="absolute top-4 right-4 w-80 bg-white p-4 rounded shadow-lg z-10 max-h-[90vh] overflow-y-auto text-black">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold">Cell Analysis</h2>
                        <button onClick={() => setSelectedCell(null)} className="text-gray-500 hover:text-gray-700">✕</button>
                    </div>

                    <div className="space-y-4">
                        <div className="text-xs text-gray-500">Index: {selectedCell.h3Index}</div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {Object.entries(selectedCell.scores).map(([k, v]) => (
                                <div key={k} className="bg-gray-50 p-2 rounded border">
                                    <div className="text-xs text-gray-500 capitalize">{k}</div>
                                    <div className="font-mono font-bold text-lg">{(v as number).toFixed(2)}</div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    // Mock call
                                    const result = await analyzePatch(41.9, 12.5);
                                    setAnalysis(result);
                                } catch (e) {
                                    console.error(e);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? 'Analyzing...' : 'Analyze Patch with AI'}
                        </button>

                        {analysis && (
                            <div className="mt-4 p-2 bg-blue-50 rounded border border-blue-100">
                                <h4 className="font-bold text-sm text-blue-800">AI Insight</h4>
                                <p className="text-xs text-blue-700 mt-1">{analysis.description}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
