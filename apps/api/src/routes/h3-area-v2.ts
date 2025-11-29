/**
 * /api/v2/h3/area - Enhanced H3 Area Query Endpoint
 *
 * Enhancements over V1:
 * - Returns full RiskDistribution (p_low, p_medium, p_high, mean, variance)
 * - Supports temporal queries (timestamp parameter)
 * - Streaming support for large area queries
 * - Comprehensive metrics and instrumentation
 * - Datacube integration (when available)
 *
 * BACKWARD COMPATIBILITY:
 * - V1 endpoint (/api/h3/area) remains unchanged
 * - V2 is opt-in for clients that need full risk distributions
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getH3RisksForAreaV2, AreaRequestV2, H3CellRiskRecord } from '../services/tileOrchestratorV2';

/**
 * Query parameters for V2 endpoint
 */
interface H3AreaV2Query {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  res?: number;
  timestamp?: string; // ISO 8601 or "latest"
  stream?: string; // "true" or "false" (query params are strings)
  explanations?: string; // "true" or "false"
}

/**
 * Compact response format (for non-streaming)
 *
 * Sends full RiskDistribution but in a compact JSON structure
 */
interface CompactRiskResponse {
  h3Index: string;
  timestamp: string;

  /** Risk distributions (compact format) */
  risks: {
    landslide: {
      mean: number;
      p_low: number;
      p_medium: number;
      p_high: number;
      variance: number;
      confidence: number;
      explanation?: string;
    };
    seismic: {
      mean: number;
      p_low: number;
      p_medium: number;
      p_high: number;
      variance: number;
      confidence: number;
      explanation?: string;
    };
    water: {
      mean: number;
      p_low: number;
      p_medium: number;
      p_high: number;
      variance: number;
      confidence: number;
      isPlaceholder: boolean;
      explanation?: string;
    };
    mineral: {
      mean: number;
      p_low: number;
      p_medium: number;
      p_high: number;
      variance: number;
      confidence: number;
      isPlaceholder: boolean;
      explanation?: string;
    };
  };

  /** Metadata */
  metadata: {
    dataSource: 'datacube' | 'adapters';
    computeTimeMs: number;
  };
}

export async function h3AreaV2Routes(fastify: FastifyInstance) {
  /**
   * GET /api/v2/h3/area - Enhanced area query with full risk distributions
   *
   * Query params:
   * - minLon, minLat, maxLon, maxLat: BBOX coordinates
   * - res: H3 resolution (default: 6)
   * - timestamp: ISO 8601 or "latest" (default: "latest")
   * - stream: Enable streaming response for large queries (default: false)
   * - explanations: Include textual risk explanations (default: false)
   *
   * Response (non-streaming):
   * {
   *   "area": { "minLon": ..., "minLat": ..., "maxLon": ..., "maxLat": ..., "resolution": 6 },
   *   "timestamp": "latest",
   *   "cells": [
   *     {
   *       "h3Index": "862a1073fffffff",
   *       "timestamp": "2024-01-15T00:00:00Z",
   *       "risks": {
   *         "landslide": { "mean": 0.65, "p_low": 0.1, "p_medium": 0.5, "p_high": 0.4, ... },
   *         "seismic": { ... },
   *         "water": { ... },
   *         "mineral": { ... }
   *       },
   *       "metadata": { "dataSource": "adapters", "computeTimeMs": 12 }
   *     },
   *     ...
   *   ],
   *   "metrics": {
   *     "totalCells": 1250,
   *     "cacheHits": 0,
   *     "cacheMisses": 1250,
   *     "dataCubeUsed": false,
   *     "timings": {
   *       "generateCells": 15,
   *       "cacheLookup": 5,
   *       "dataFetch": 2340,
   *       "riskComputation": 156,
   *       "total": 2516
   *     }
   *   }
   * }
   *
   * Response (streaming):
   * NDJSON stream (newline-delimited JSON), each line is a chunk:
   * {"type":"progress","processed":100,"total":1250}
   * {"type":"data","cells":[...]}
   * {"type":"progress","processed":200,"total":1250}
   * {"type":"data","cells":[...]}
   * ...
   * {"type":"complete","metrics":{...}}
   */
  fastify.get<{
    Querystring: H3AreaV2Query;
  }>('/api/v2/h3/area', async (request: FastifyRequest<{ Querystring: H3AreaV2Query }>, reply: FastifyReply) => {
    const { minLon, minLat, maxLon, maxLat, res, timestamp, stream, explanations } = request.query;

    // Validate required parameters
    if (minLon === undefined || minLat === undefined || maxLon === undefined || maxLat === undefined) {
      return reply.code(400).send({
        error: 'Missing BBOX parameters',
        required: ['minLon', 'minLat', 'maxLon', 'maxLat']
      });
    }

    const area: AreaRequestV2 = {
      minLon: Number(minLon),
      minLat: Number(minLat),
      maxLon: Number(maxLon),
      maxLat: Number(maxLat),
      resolution: Number(res) || 6,
      timestamp: timestamp || 'latest',
      riskConfig: {
        missingDataStrategy: 'conservative',
        computeQuantiles: false,
        generateExplanations: explanations === 'true'
      }
    };

    try {
      // === STREAMING MODE ===
      if (stream === 'true') {
        reply.raw.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache'
        });

        const { cells, metrics } = await getH3RisksForAreaV2(area, (progress) => {
          // Stream progress update
          reply.raw.write(JSON.stringify({
            type: 'progress',
            processed: progress.processed,
            total: progress.total
          }) + '\n');

          // Stream data chunk
          const compactCells = progress.cells.map(toCompactFormat);
          reply.raw.write(JSON.stringify({
            type: 'data',
            cells: compactCells
          }) + '\n');
        });

        // Stream completion
        reply.raw.write(JSON.stringify({
          type: 'complete',
          metrics
        }) + '\n');

        reply.raw.end();
        return;
      }

      // === STANDARD MODE (Non-Streaming) ===
      const { cells, metrics } = await getH3RisksForAreaV2(area);

      const compactCells = cells.map(toCompactFormat);

      return {
        area: {
          minLon: area.minLon,
          minLat: area.minLat,
          maxLon: area.maxLon,
          maxLat: area.maxLat,
          resolution: area.resolution
        },
        timestamp: area.timestamp,
        cells: compactCells,
        metrics
      };

    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

/**
 * Convert full H3CellRiskRecord to compact response format
 */
function toCompactFormat(record: H3CellRiskRecord): CompactRiskResponse {
  return {
    h3Index: record.h3Index,
    timestamp: record.timestamp,
    risks: {
      landslide: {
        mean: record.risks.landslide.distribution.mean,
        p_low: record.risks.landslide.distribution.p_low,
        p_medium: record.risks.landslide.distribution.p_medium,
        p_high: record.risks.landslide.distribution.p_high,
        variance: record.risks.landslide.distribution.variance,
        confidence: record.risks.landslide.confidence,
        explanation: record.risks.landslide.explanation
      },
      seismic: {
        mean: record.risks.seismic.distribution.mean,
        p_low: record.risks.seismic.distribution.p_low,
        p_medium: record.risks.seismic.distribution.p_medium,
        p_high: record.risks.seismic.distribution.p_high,
        variance: record.risks.seismic.distribution.variance,
        confidence: record.risks.seismic.confidence,
        explanation: record.risks.seismic.explanation
      },
      water: {
        mean: record.risks.water.distribution.mean,
        p_low: record.risks.water.distribution.p_low,
        p_medium: record.risks.water.distribution.p_medium,
        p_high: record.risks.water.distribution.p_high,
        variance: record.risks.water.distribution.variance,
        confidence: record.risks.water.confidence,
        isPlaceholder: record.risks.water.isPlaceholder || false,
        explanation: record.risks.water.explanation
      },
      mineral: {
        mean: record.risks.mineral.distribution.mean,
        p_low: record.risks.mineral.distribution.p_low,
        p_medium: record.risks.mineral.distribution.p_medium,
        p_high: record.risks.mineral.distribution.p_high,
        variance: record.risks.mineral.distribution.variance,
        confidence: record.risks.mineral.confidence,
        isPlaceholder: record.risks.mineral.isPlaceholder || false,
        explanation: record.risks.mineral.explanation
      }
    },
    metadata: {
      dataSource: record.metadata.dataSource,
      computeTimeMs: record.metadata.computeTimeMs
    }
  };
}
