import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import * as dotenv from 'dotenv';
import { CellScore } from '@geo-lens/geocube';
import { analyzeRiskWithContext } from '@geo-lens/gemini-client';

// Load environment variables
dotenv.config();

const server = Fastify({ logger: true });

server.register(cors);

// Serve PMTiles with Range Request support (handled natively by fastify-static)
server.register(fastifyStatic, {
    root: path.join(__dirname, '../public/tiles'),
    prefix: '/tiles/',
    acceptRanges: true, // Critical for PMTiles
    decorateReply: false
});

server.get('/health', async () => {
    return { status: 'ok' };
});

// Procedural Generation Helpers
const getSeismicRisk = (lat: number): { pga: number, class: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH', score: number } => {
    // Mock: Higher risk in South Europe (lower lat)
    const baseRisk = Math.max(0, (50 - lat) / 20); // 0 at 50N, 1 at 30N
    const pga = baseRisk * 0.5 + Math.random() * 0.1;
    let cls: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' = 'LOW';
    if (pga > 0.4) cls = 'VERY_HIGH';
    else if (pga > 0.25) cls = 'HIGH';
    else if (pga > 0.1) cls = 'MODERATE';

    return { pga, class: cls, score: Math.min(1, pga * 2) };
};

server.get<{ Params: { h3Index: string } }>('/cell/:h3Index', async (request, reply) => {
    const { h3Index } = request.params;

    // In a real app, we would decode H3 to lat/lon here using h3-js
    // For MVP, we'll fake it or rely on query params if passed, but let's assume we can get it.
    // Since we don't have h3-js in API yet, let's generate random but deterministic-ish data based on the string
    const pseudoLat = 40 + (h3Index.charCodeAt(h3Index.length - 1) % 20); // Mock lat between 40 and 60
    const pseudoLon = 10 + (h3Index.charCodeAt(h3Index.length - 2) % 20); // Mock lon between 10 and 30

    const seismic = getSeismicRisk(pseudoLat);

    const response: CellScore = {
        h3Index,
        water: {
            stress: Math.random(),
            recharge: Math.random(),
            score: Math.random()
        },
        landslide: {
            susceptibility: Math.random(),
            history: Math.random() > 0.8,
            score: Math.random()
        },
        seismic,
        mineral: {
            prospectivity: Math.random(),
            type: Math.random() > 0.7 ? (Math.random() > 0.5 ? "Lithium" : "Copper") : "None",
            score: Math.random()
        },
        metadata: {
            lat: pseudoLat,
            lon: pseudoLon,
            elevation: Math.random() * 2000,
            biome: "Mediterranean Forests"
        }
    };

    return response;
});

server.post<{ Body: { h3Index: string; context: any } }>('/ai/analyze', async (request, reply) => {
    const { h3Index, context } = request.body;
    const apiKey = process.env.GEMINI_API_KEY || '';

    if (!apiKey) {
        request.log.warn('GEMINI_API_KEY not found in environment variables.');
    }

    // Map frontend context to RiskContext
    const riskContext = {
        slopeMean: context.slope || 0,
        landslideHistory: context.landslideHistory || 'UNKNOWN'
    };

    // Call Real Gemini Client
    const result = await analyzeRiskWithContext(h3Index, 'mock-image-buffer', riskContext, apiKey);

    return {
        risk_confirmation: result.visualConfirmation,
        confidence: result.confidence,
        key_visual_clues: ["Analysis based on provided context"], // Placeholder as real image analysis isn't fully wired
        reasoning: result.reasoning
    };
});

server.post<{ Body: { message: string; history: any[]; context: string } }>('/ai/chat', async (request, reply) => {
    const { message, history, context } = request.body;
    const apiKey = process.env.GEMINI_API_KEY || '';

    // Import dynamically to ensure it's loaded
    const { chatWithMap } = await import('@geo-lens/gemini-client');

    const response = await chatWithMap(history || [], message, context, apiKey);
    return { response };
});

const start = async () => {
    try {
        await server.listen({ port: 3001, host: '0.0.0.0' });
        console.log('API Server running at http://localhost:3001');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
