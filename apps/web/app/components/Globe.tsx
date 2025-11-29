'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Viewer, Entity, Primitive, CesiumComponentRef } from 'resium';
import { Cartesian3, Color, GeometryInstance, PolygonGeometry, PerInstanceColorAppearance, ColorGeometryInstanceAttribute, ShowGeometryInstanceAttribute, PolygonHierarchy, Ion } from 'cesium';
import { cellToBoundary } from 'h3-js';
import { CellScore } from '@geo-lens/geocube';

// Set Cesium Ion access token
if (typeof window !== 'undefined') {
    (window as any).CESIUM_BASE_URL = '/cesium';

    // Configure Cesium Ion token
    Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyYTQ1OTgzMi1mZTBmLTRhMmItYTFmNi01NzllNzI3YmE1MjgiLCJpZCI6MzY1MDY3LCJpYXQiOjE3NjQ0Mjk3MzR9.asySfyHzM3vnP8tx43Gq5susyuKWPHOuOmseVH7ReXg';
}

// Color scales (matching MapOverlay.tsx)
const getColor = (score: number, type: string): Color => {
    // Simple linear interpolation for 3D
    switch (type) {
        case 'water': return Color.fromCssColorString('#0D47A1').withAlpha(0.6);
        case 'landslide': return Color.fromCssColorString('#3E2723').withAlpha(0.6);
        case 'seismic': return Color.fromCssColorString('#B71C1C').withAlpha(0.6);
        case 'mineral': return Color.fromCssColorString('#FF6F00').withAlpha(0.6);
        default: return Color.WHITE.withAlpha(0.5);
    }
};

interface Props {
    selectedLayer: string;
}

export default function Globe({ selectedLayer }: Props) {
    const [mounted, setMounted] = useState(false);
    const [h3Data, setH3Data] = useState<CellScore[]>([]);

    useEffect(() => {
        setMounted(true);
        // Fetch data
        fetch('http://localhost:3001/static/data/h3-data.json')
            .then(res => res.json())
            .then(data => setH3Data(data))
            .catch(err => console.error("Failed to load H3 data for Globe", err));
    }, []);

    const geometryInstances = useMemo(() => {
        if (!h3Data.length) return [];

        return h3Data.map(cell => {
            const boundary = cellToBoundary(cell.h3Index);
            const positions = Cartesian3.fromDegreesArray(boundary.flat());

            // @ts-ignore
            const score = cell[selectedLayer]?.score || 0;
            const color = getColor(score, selectedLayer);

            return new GeometryInstance({
                geometry: new PolygonGeometry({
                    polygonHierarchy: new PolygonHierarchy(positions),
                    extrudedHeight: score * 5000, // Extrude based on score
                    height: 0
                }),
                attributes: {
                    color: ColorGeometryInstanceAttribute.fromColor(color),
                    show: new ShowGeometryInstanceAttribute(true)
                },
                id: cell.h3Index
            });
        });
    }, [h3Data, selectedLayer]);

    if (!mounted) return null;

    return (
        <Viewer full>
            <Entity
                name="Europe Center"
                position={Cartesian3.fromDegrees(12.5, 41.9, 100000)}
                point={{ pixelSize: 10 }}
            />
            {geometryInstances.length > 0 && (
                <Primitive
                    geometryInstances={geometryInstances}
                    appearance={new PerInstanceColorAppearance({
                        translucent: true,
                        closed: true
                    })}
                />
            )}
        </Viewer>
    );
}
