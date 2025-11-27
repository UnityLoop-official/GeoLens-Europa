'use client';

import React, { useEffect, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3 } from 'cesium';

// Set base URL for Cesium assets
if (typeof window !== 'undefined') {
    (window as any).CESIUM_BASE_URL = '/cesium';
}

export default function Globe() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <Viewer full>
            <Entity
                name="Europe Center"
                position={Cartesian3.fromDegrees(12.5, 41.9, 100000)}
                point={{ pixelSize: 10 }}
            />
        </Viewer>
    );
}
