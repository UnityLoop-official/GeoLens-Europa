'use client';

import React from 'react';
import { CellScore } from '@geo-lens/geocube';

type Props = {
    cell: CellScore | null;
    onClose: () => void;
    onAnalyze: () => void;
    loading: boolean;
    analysis: any;
};

export default function Sidebar({ cell, onClose, onAnalyze, loading, analysis }: Props) {
    if (!cell) return null;

    return (
        <div className="absolute top-4 right-4 w-96 bg-white/95 backdrop-blur shadow-2xl rounded-xl z-20 max-h-[90vh] overflow-y-auto text-slate-800 border border-slate-200 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10">
                <div>
                    <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Hazard Cube
                    </h2>
                    <div className="text-xs text-slate-400 font-mono mt-1">H3: {cell.h3Index}</div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400 hover:text-slate-600">
                    ✕
                </button>
            </div>

            <div className="p-4 space-y-6">
                {/* Water Axis */}
                <Section title="Water Stress" color="blue" score={cell.water.score}>
                    <Metric label="Stress Index" value={cell.water.stress} />
                    <Metric label="Recharge Potential" value={cell.water.recharge} />
                </Section>

                {/* Landslide Axis */}
                <Section title="Mass Movement" color="amber" score={cell.landslide.score}>
                    <Metric label="Susceptibility" value={cell.landslide.susceptibility} />
                    <div className="flex justify-between text-sm py-1 border-b border-slate-50">
                        <span className="text-slate-500">History</span>
                        <span className={`font-medium ${cell.landslide.history ? 'text-red-600' : 'text-green-600'}`}>
                            {cell.landslide.history ? 'Recorded Events' : 'None'}
                        </span>
                    </div>
                </Section>

                {/* Seismic Axis */}
                <Section title="Seismic Risk" color="red" score={cell.seismic.score}>
                    <Metric label="PGA (g)" value={cell.seismic.pga} />
                    <div className="flex justify-between text-sm py-1 border-b border-slate-50">
                        <span className="text-slate-500">Class</span>
                        <span className="font-bold text-slate-800">{cell.seismic.class}</span>
                    </div>
                </Section>

                {/* Mineral Axis */}
                <Section title="Resources" color="purple" score={cell.mineral.score}>
                    <Metric label="Prospectivity" value={cell.mineral.prospectivity} />
                    <div className="flex justify-between text-sm py-1 border-b border-slate-50">
                        <span className="text-slate-500">Type</span>
                        <span className="font-medium text-slate-800">{cell.mineral.type}</span>
                    </div>
                </Section>

                {/* Metadata */}
                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 space-y-1">
                    <div className="flex justify-between"><span>Biome</span> <span className="font-medium">{cell.metadata.biome}</span></div>
                    <div className="flex justify-between"><span>Elevation</span> <span className="font-medium">{cell.metadata.elevation.toFixed(0)}m</span></div>
                </div>

                {/* AI Action */}
                <button
                    onClick={onAnalyze}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-70 disabled:scale-100 flex justify-center items-center gap-2"
                >
                    {loading ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Analyzing Context...
                        </>
                    ) : (
                        <>
                            <span>✨</span> Analyze with Gemini AI
                        </>
                    )}
                </button>

                {/* AI Result */}
                {analysis && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-indigo-900">AI Assessment</h4>
                            <span className="px-2 py-0.5 bg-indigo-200 text-indigo-800 text-[10px] font-bold rounded-full">CONFIDENCE {(analysis.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-sm text-indigo-800 leading-relaxed">
                            {analysis.reasoning}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {analysis.key_visual_clues?.map((clue: string, i: number) => (
                                <span key={i} className="px-2 py-1 bg-white/50 border border-indigo-100 text-indigo-700 text-xs rounded-md">
                                    🔍 {clue}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Section({ title, color, score, children }: { title: string, color: string, score: number, children: React.ReactNode }) {
    const colorClasses = {
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
        red: 'bg-red-500',
        purple: 'bg-purple-500'
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-end">
                <h3 className="font-semibold text-slate-700">{title}</h3>
                <span className="text-xs font-mono text-slate-400">{(score * 100).toFixed(0)}/100</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${colorClasses[color as keyof typeof colorClasses]} transition-all duration-1000 ease-out`}
                    style={{ width: `${score * 100}%` }}
                />
            </div>
            <div className="pl-2 border-l-2 border-slate-100 space-y-1">
                {children}
            </div>
        </div>
    );
}

function Metric({ label, value }: { label: string, value: number }) {
    return (
        <div className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-800">{value.toFixed(2)}</span>
        </div>
    );
}
