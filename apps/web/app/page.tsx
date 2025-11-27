'use client';

import { useState } from 'react';
import Map from './components/Map';
import dynamic from 'next/dynamic';

// Dynamically import Globe to avoid SSR issues with Cesium
const Globe = dynamic(() => import('./components/Globe'), { ssr: false });

export default function Home() {
  const [mode, setMode] = useState<'2D' | '3D'>('2D');

  return (
    <main className="flex min-h-screen flex-col">
      <div className="w-full h-screen relative">
        {mode === '2D' ? <Map /> : <Globe />}

        <div className="absolute top-4 left-4 bg-white p-4 rounded shadow z-10">
          <h1 className="text-xl font-bold mb-2">GeoLens Europa</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setMode('2D')}
              className={`px-3 py-1 rounded ${mode === '2D' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              2D Map
            </button>
            <button
              onClick={() => setMode('3D')}
              className={`px-3 py-1 rounded ${mode === '3D' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              3D Globe
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">Click on the map to inspect a cell.</p>
        </div>
      </div>
    </main>
  );
}
