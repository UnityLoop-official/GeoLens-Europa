'use client';

import React, { useEffect, useRef, useState } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { getCellData, analyzePatch } from '../lib/api';
import { CellScore } from '@geo-lens/geocube';
import { getCellFromLatLng, getDisk } from '@geo-lens/core-geo';
import MapOverlay from './MapOverlay';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';


// Mock H3 Data generator for the overlay (since we don't have a full backend tile server yet)
// In a real app, Deck.gl would fetch tiles directly.
const generateMockH3Data = (lat: number, lon: number): CellScore[] => {
    const centerH3 = getCellFromLatLng(lat, lon, 6); // Coarser resolution for demo
    const neighbors = getDisk(centerH3, 8); // Larger area

    return neighbors.map(h3Index => ({
        h3Index,
        water: { stress: Math.random(), recharge: Math.random(), score: Math.random() },
        landslide: { susceptibility: Math.random(), history: Math.random() > 0.9, score: Math.random() },
        seismic: { pga: Math.random(), class: 'LOW', score: Math.random() },
        mineral: { prospectivity: Math.random(), type: 'None', score: Math.random() },
        metadata: { lat, lon, elevation: 0, biome: 'Unknown' }
    }));
};

export default function MapView() {
    const [viewState, setViewState] = useState({
        longitude: 12.5,
        latitude: 41.9,
        zoom: 6
    });
    const [selectedLayer, setSelectedLayer] = useState<'water' | 'mineral' | 'landslide' | 'seismic'>('water');
    const [h3Data, setH3Data] = useState<CellScore[]>([]);
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [selectedCell, setSelectedCell] = useState<CellScore | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Register PMTiles Protocol
        const protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);

        // Load initial mock data for visualization
        setH3Data(generateMockH3Data(41.9, 12.5));

        return () => {
            maplibregl.removeProtocol('pmtiles');
        };
    }, []);

    const onHover = (info: any) => {
        setHoverInfo(info);
    };

    const onClick = async (info: any) => {
        if (info.object) {
            // Fetch detailed data from backend
            const cell = info.object as CellScore;
            setSelectedCell(cell); // Optimistic update
            setAnalysis(null);

            try {
                const detailedData = await getCellData(cell.h3Index);
                setSelectedCell(detailedData);
            } catch (e) {
                console.error("Failed to fetch details", e);
            }
        }
    };

    const handleAnalyze = async () => {
        if (!selectedCell) return;
        setLoading(true);
        try {
            const result = await analyzePatch(selectedCell.h3Index, {
                slope: 45, // Mock context
                landslideHistory: selectedCell.landslide.history ? 'HIGH' : 'LOW'
            });
            setAnalysis(result);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative w-full h-full font-sans">
            <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: '100%', height: '100%' }}
                mapStyle="https://demotiles.maplibre.org/style.json"
                pitch={45} // Tilt for 3D effect
            >
                <NavigationControl position="top-right" />

                {/* PMTiles Source Example (Hidden for now as we use Deck.gl) */}
                {/* <Source id="pmtiles-source" type="vector" url="pmtiles://http://localhost:3001/tiles/dummy.pmtiles"> ... </Source> */}

                <MapOverlay
                    data={h3Data}
                    selectedLayer={selectedLayer}
                    onHover={onHover}
                    onClick={onClick}
                />
            </Map>

            {/* Layer Control */}
            <div className="absolute top-6 left-6 bg-white/90 backdrop-blur p-1.5 rounded-lg shadow-lg z-10 flex gap-1 border border-slate-200">
                {(['water', 'mineral', 'landslide', 'seismic'] as const).map(layer => (
                    <button
                        key={layer}
                        onClick={() => setSelectedLayer(layer)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize ${selectedLayer === layer
                            ? 'bg-slate-800 text-white shadow-md'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        {layer}
                    </button>
                ))}
            </div>

            {/* Tooltip */}
            {hoverInfo && hoverInfo.object && (
                <div
                    className="absolute bg-slate-900/90 text-white p-3 rounded-lg text-xs pointer-events-none z-30 backdrop-blur border border-slate-700 shadow-xl"
                    style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}
                >
                    <div className="font-mono text-slate-400 mb-1">{hoverInfo.object.h3Index}</div>
                    <div className="font-bold text-lg">
                        {(hoverInfo.object[selectedLayer].score * 100).toFixed(0)}
                        <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
                    </div>
                </div>
            )}

            {/* Advanced Sidebar */}
            <Sidebar
                cell={selectedCell}
                onClose={() => setSelectedCell(null)}
                onAnalyze={handleAnalyze}
                loading={loading}
                analysis={analysis}
            />

            {/* Chat Panel */}
            <ChatPanel />
        </div>
    );
}
