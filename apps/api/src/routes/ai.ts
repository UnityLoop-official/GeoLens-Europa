/**
 * AI Enhancement Routes
 *
 * OPTIONAL endpoints that enhance core functionality with AI.
 * Core risk computation (datacube + risk-engine) works WITHOUT these endpoints.
 *
 * Endpoints:
 * - POST /api/ai/analyze - AI-enhanced risk analysis
 * - POST /api/ai/chat - Conversational interface
 * - GET /api/ai/status - Check AI service availability
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAIService, RiskContext, ChatMessage } from '../services/ai';

/**
 * Request body for /api/ai/analyze
 */
interface AnalyzeRequest {
  h3Index: string;

  /** Cell features (from datacube or V2 endpoint) */
  features: {
    elevation?: number;
    slope?: number;
    elsusClass?: number;
    hazardPGA?: number;
    clcClass?: number;
    rain24h?: number;
    [key: string]: any;
  };

  /** Computed risks (from risk-engine) */
  risks: {
    landslide: { mean: number; confidence: number; explanation?: string };
    seismic: { mean: number; confidence: number; explanation?: string };
    water: { mean: number; confidence: number; isPlaceholder?: boolean; explanation?: string };
    mineral: { mean: number; confidence: number; isPlaceholder?: boolean; explanation?: string };
  };

  /** Optional: imagery for visual analysis */
  imagery?: {
    satelliteUrl?: string;
    base64Image?: string;
  };
}

/**
 * Request body for /api/ai/chat
 */
interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  context?: string; // Current map view, selected cell, etc.
}

export async function aiRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/ai/status - Check AI service availability
   *
   * Returns:
   * {
   *   "available": true,
   *   "provider": "gemini" | "openai" | "claude" | "local" | "none",
   *   "features": ["analyze", "chat"]
   * }
   */
  fastify.get('/api/ai/status', async (request, reply) => {
    const aiService = getAIService();
    const available = await aiService.isAvailable();
    const provider = aiService.getProvider();

    return {
      available,
      provider,
      features: available ? ['analyze', 'chat'] : [],
      message: available
        ? `AI service available (${provider})`
        : 'AI service unavailable - core functionality works without AI'
    };
  });

  /**
   * POST /api/ai/analyze - AI-enhanced risk analysis
   *
   * Request body:
   * {
   *   "h3Index": "872a1070fffffff",
   *   "features": { "slope": 35, "elsusClass": 4, ... },
   *   "risks": {
   *     "landslide": { "mean": 0.65, "confidence": 1.0, "explanation": "..." },
   *     ...
   *   }
   * }
   *
   * Response:
   * {
   *   "risks": { ... }, // Unchanged from request
   *   "insights": {
   *     "summary": "AI-generated plain-language summary",
   *     "keyFactors": ["Steep slope (35°)", "High seismic hazard"],
   *     "confidence": 0.85,
   *     "recommendations": ["Monitor rainfall", ...]
   *   },
   *   "metadata": {
   *     "provider": "gemini",
   *     "model": "gemini-1.5-flash",
   *     "latencyMs": 1250
   *   }
   * }
   */
  fastify.post<{
    Body: AnalyzeRequest;
  }>('/api/ai/analyze', async (request: FastifyRequest<{ Body: AnalyzeRequest }>, reply: FastifyReply) => {
    const { h3Index, features, risks, imagery } = request.body;

    // Validate required fields
    if (!h3Index || !features || !risks) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: ['h3Index', 'features', 'risks']
      });
    }

    try {
      const aiService = getAIService();

      const context: RiskContext = {
        h3Index,
        features,
        risks,
        imagery
      };

      const analysis = await aiService.analyzeRisk(context);

      return analysis;

    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'AI analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/ai/chat - Conversational interface
   *
   * Request body:
   * {
   *   "message": "What are the landslide risks in Rome?",
   *   "history": [
   *     { "role": "user", "content": "Show me Rome", "timestamp": "..." },
   *     { "role": "assistant", "content": "Displaying Rome area...", "timestamp": "..." }
   *   ],
   *   "context": "Current view: Rome, lat=41.9, lon=12.5, zoom=10"
   * }
   *
   * Response:
   * {
   *   "message": "AI response message",
   *   "suggestions": ["Follow-up question 1", "Follow-up question 2"],
   *   "metadata": {
   *     "provider": "gemini",
   *     "latencyMs": 850
   *   }
   * }
   */
  fastify.post<{
    Body: ChatRequest;
  }>('/api/ai/chat', async (request: FastifyRequest<{ Body: ChatRequest }>, reply: FastifyReply) => {
    const { message, history, context } = request.body;

    if (!message) {
      return reply.code(400).send({
        error: 'Missing required field: message'
      });
    }

    try {
      const aiService = getAIService();

      const response = await aiService.chat(
        history || [],
        message,
        context
      );

      return response;

    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'AI chat failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
