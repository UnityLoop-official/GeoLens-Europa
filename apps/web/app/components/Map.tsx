'use client';

import React, { useEffect, useRef, useState } from 'react';
import MapLibre, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
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

interface Props {
    selectedLayer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite';
    onLayerChange: (layer: 'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite') => void;
}

export default function MapView({ selectedLayer, onLayerChange }: Props) {
    const [viewState, setViewState] = useState({
        longitude: 12.5,
        latitude: 41.9,
        zoom: 6
    });
    // const [selectedLayer, setSelectedLayer] = useState<'water' | 'mineral' | 'landslide' | 'seismic' | 'satellite'>('water');
    const [h3Data, setH3Data] = useState<CellScore[]>([]);
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [selectedCell, setSelectedCell] = useState<CellScore | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Register PMTiles Protocol (Optional, keeping for future use)
        const protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);

        // Fetch Real Data from API (Initial Load)
        const fetchData = async () => {
            try {
                const res = await fetch('http://localhost:3001/static/data/h3-data.json');
                if (!res.ok) throw new Error('Failed to fetch data');
                const data = await res.json();
                setH3Data(data);
            } catch (e) {
                console.error("Failed to load H3 data, falling back to mock", e);
                setH3Data(generateMockH3Data(41.9, 12.5));
            }
        };

        fetchData();

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

    const abortController = useRef<AbortController | null>(null);

    const getResolutionForZoom = (zoom: number): number => {
        if (zoom < 5) return 2; // ~158km edge
        if (zoom < 6.5) return 3; // ~60km edge (Adjusted from 7)
        if (zoom < 8.5) return 4; // ~22km edge (Adjusted from 9)
        return 6; // ~3.2km edge
    };

    const fetchChunk = async (minLon: number, minLat: number, maxLon: number, maxLat: number, res: number, signal: AbortSignal) => {
        try {
            const query = new URLSearchParams({
                minLon: minLon.toString(),
                minLat: minLat.toString(),
                maxLon: maxLon.toString(),
                maxLat: maxLat.toString(),
                res: res.toString()
            });

            const response = await fetch(`http://localhost:3001/api/h3/area?${query}`, { signal });
            if (!response.ok) throw new Error(`Failed to fetch chunk`);

            const { cells } = await response.json();

            setH3Data(prev => {
                const newMap = new Map(prev.map(c => [c.h3Index, c]));
                cells.forEach((c: CellScore) => newMap.set(c.h3Index, c));
                return Array.from(newMap.values());
            });
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error("Chunk fetch failed", e);
            }
        }
    };

    const fetchAreaData = async (bounds: maplibregl.LngLatBounds, zoom: number) => {
        // Cancel previous requests
        if (abortController.current) {
            abortController.current.abort();
        }
        abortController.current = new AbortController();
        const signal = abortController.current.signal;

        const res = getResolutionForZoom(zoom);

        // Split bounds into 4 quadrants for "streaming" effect
        const west = bounds.getWest();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const midLon = (west + east) / 2;
        const midLat = (south + north) / 2;

        const quadrants = [
            { minLon: west, minLat: south, maxLon: midLon, maxLat: midLat }, // SW
            { minLon: midLon, minLat: south, maxLon: east, maxLat: midLat }, // SE
            { minLon: west, minLat: midLat, maxLon: midLon, maxLat: north }, // NW
            { minLon: midLon, minLat: midLat, maxLon: east, maxLat: north }  // NE
        ];

        // Fetch quadrants in parallel
        quadrants.forEach(q => {
            fetchChunk(q.minLon, q.minLat, q.maxLon, q.maxLat, res, signal);
        });
    };

    const onMoveEnd = (evt: any) => {
        const bounds = evt.target.getBounds();
        const zoom = evt.target.getZoom();
        fetchAreaData(bounds, zoom);
    };

    return (
        <div className="relative w-full h-full font-sans">
            {/* Layer Control */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur p-1.5 rounded-lg shadow-lg z-10 flex gap-1 border border-slate-200">
                <button
                    onClick={() => onLayerChange(selectedLayer === 'satellite' ? 'water' : 'satellite')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${selectedLayer === 'satellite'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100'
                        }`}
                >
                    <span>🛰️</span> Satellite
                </button>
                <div className="w-px bg-slate-300 mx-1" />
                {(['water', 'mineral', 'landslide', 'seismic'] as const).map(layer => (
                    <button
                        key={layer}
                        onClick={() => onLayerChange(layer)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize ${selectedLayer === layer
                            ? 'bg-slate-800 text-white shadow-md'
                            : 'text-slate-600 hover:bg-slate-100'
                            }`}
                    >
                        {layer}
                    </button>
                ))}
            </div>

            <MapLibre
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                onMoveEnd={onMoveEnd}
                style={{ width: '100%', height: '100%' }}
                mapStyle="https://demotiles.maplibre.org/style.json"
                pitch={45}
            >
                <NavigationControl position="top-right" />

                {/* Sentinel-2 Cloudless WMS (EOX) */}
                {selectedLayer === 'satellite' && (
                    <Source
                        id="sentinel2-source"
                        type="raster"
                        tiles={[
                            'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'
                        ]}
                        tileSize={256}
                        attribution="Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)"
                    >
                        <Layer id="sentinel2-layer" type="raster" beforeId="h3-layer" />
                    </Source>
                )}

                {/* ESHM20 Seismic Hazard WMS (EFEHR) - Placeholder WMS as direct URL requires specific ID */}
                {/* Using a generic seismic hazard WMS or overlaying our H3 data with attribution */}
                {selectedLayer === 'seismic' && (
                    <div className="absolute bottom-20 left-6 bg-white/90 backdrop-blur p-2 rounded text-xs text-slate-500 z-10">
                        Source: ESHM20 (EFEHR) via GeoLens
                    </div>
                )}

                <MapOverlay
                    data={h3Data}
                    selectedLayer={selectedLayer}
                    onHover={onHover}
                    onClick={onClick}
                />
            </MapLibre>

            {/* Tooltip */}
            {hoverInfo && hoverInfo.object && (
                <div
                    className="absolute bg-slate-900/90 text-white p-3 rounded-lg text-xs pointer-events-none z-30 backdrop-blur border border-slate-700 shadow-xl"
                    style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}
                >
                    <div className="font-mono text-slate-400 mb-1">{hoverInfo.object.h3Index}</div>
                    <div className="font-bold text-lg">
                        {selectedLayer === 'satellite'
                            ? 'N/A'
                            : (hoverInfo.object[selectedLayer]?.score * 100).toFixed(0)
                        }
                        {selectedLayer !== 'satellite' && <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>}
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
            <ChatPanel context={selectedCell} />
        </div>
    );
}
