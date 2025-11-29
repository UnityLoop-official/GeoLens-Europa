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
        <div className="absolute top-4 right-4 w-96 bg-white/80 backdrop-blur-xl shadow-2xl rounded-2xl z-20 max-h-[90vh] overflow-y-auto text-slate-800 border border-white/50 flex flex-col animate-in slide-in-from-right-10 duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-100/50 flex justify-between items-start sticky top-0 bg-white/80 backdrop-blur-xl z-10">
                <div>
                    <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
                        Hazard Cube
                    </h2>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-mono text-slate-500 tracking-wide uppercase">
                            H3 Index
                        </span>
                        <span className="text-xs font-mono text-slate-600 font-medium">{cell.h3Index}</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 -mr-2 -mt-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div className="p-5 space-y-6">
                {/* Water Axis */}
                <Card title="Water Stress" icon="💧" color="blue" score={cell.water.score} source="Risk Engine (Terrain Proxy)">
                    <Metric label="Stress Index" value={cell.water.stress} />
                    <Metric label="Recharge Potential" value={cell.water.recharge} />
                </Card>

                {/* Landslide Axis */}
                <Card title="Mass Movement" icon="🏔️" color="amber" score={cell.landslide.score} source="Risk Engine (DEM + ELSUS)">
                    <Metric label="Susceptibility" value={cell.landslide.susceptibility} />
                    <div className="flex justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500 font-medium">History</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-xs ${cell.landslide.history ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {cell.landslide.history ? 'Recorded Events' : 'Safe'}
                        </span>
                    </div>
                </Card>

                {/* Seismic Axis */}
                <Card title="Seismic Risk" icon="📉" color="red" score={cell.seismic.score} source="ESHM20 (EFEHR)">
                    <Metric label="PGA (g)" value={cell.seismic.pga} />
                    <div className="flex justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500 font-medium">Class</span>
                        <span className="font-bold text-slate-800">{cell.seismic.class}</span>
                    </div>
                </Card>

                {/* Mineral Axis - HIDDEN FOR RISK ENGINE V1 (focused on water/flood and landslide only) */}
                {/* TODO: Re-enable when mineral prospectivity model is validated */}
                {/* <Card title="Resources" icon="💎" color="purple" score={cell.mineral.score} source="Modeled Data">
                    <Metric label="Prospectivity" value={cell.mineral.prospectivity} />
                    <div className="flex justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500 font-medium">Type</span>
                        <span className="font-bold text-slate-800">{cell.mineral.type}</span>
                    </div>
                </Card> */}

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Biome</span>
                        <span className="text-xs font-semibold text-slate-700 mt-1 line-clamp-1">{cell.metadata.biome}</span>
                    </div>
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Elevation</span>
                        <span className="text-xs font-semibold text-slate-700 mt-1">{cell.metadata.elevation.toFixed(0)}m</span>
                    </div>
                </div>

                {/* AI Action */}
                <div className="pt-2">
                    <button
                        onClick={onAnalyze}
                        disabled={loading}
                        className="group relative w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative flex justify-center items-center gap-2">
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Analyzing...</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-lg">✨</span>
                                    <span>Analyze with Gemini</span>
                                </>
                            )}
                        </div>
                    </button>
                </div>

                {/* AI Result */}
                {analysis && (
                    <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-600"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                    AI Assessment
                                </h4>
                                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full border border-indigo-200 shadow-sm">
                                    {Math.round(analysis.confidence * 100)}% CONFIDENCE
                                </span>
                            </div>

                            <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                {analysis.reasoning}
                            </p>

                            {analysis.key_visual_clues && analysis.key_visual_clues.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-indigo-100/50 flex flex-wrap gap-2">
                                    {analysis.key_visual_clues.map((clue: string, i: number) => (
                                        <span key={i} className="px-2 py-1 bg-white border border-indigo-100 text-indigo-600 text-[10px] font-bold uppercase tracking-wide rounded-md shadow-sm">
                                            {clue}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Card({ title, icon, color, score, source, children }: { title: string, icon: string, color: string, score: number, source?: string, children: React.ReactNode }) {
    const colorClasses = {
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
        red: 'bg-red-500',
        purple: 'bg-purple-500'
    };

    const bgClasses = {
        blue: 'bg-blue-50',
        amber: 'bg-amber-50',
        red: 'bg-red-50',
        purple: 'bg-purple-50'
    };

    return (
        <div className={`rounded-xl border border-slate-100 p-4 transition-all hover:shadow-md ${bgClasses[color as keyof typeof bgClasses]}`}>
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${colorClasses[color as keyof typeof colorClasses]} rounded-full transition-all duration-1000 ease-out`}
                            style={{ width: `${score * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-6 text-right">{(score * 100).toFixed(0)}</span>
                </div>
            </div>
            <div className="space-y-0.5">
                {children}
            </div>
            {source && (
                <div className="mt-2 pt-2 border-t border-slate-200/50 text-[10px] text-slate-400 font-mono text-right">
                    Source: {source}
                </div>
            )}
        </div>
    );
}

function Metric({ label, value }: { label: string, value: number }) {
    return (
        <div className="flex justify-between text-sm py-2 border-b border-slate-50 last:border-0">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="font-bold text-slate-800">{value.toFixed(2)}</span>
        </div>
    );
}
