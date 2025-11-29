/**
 * Gemini AI Service Implementation
 *
 * Wraps @geo-lens/gemini-client behind the AIService interface.
 * Handles API key validation and graceful degradation.
 */

import {
  AIService,
  RiskContext,
  AIRiskAnalysis,
  ChatMessage,
  ChatResponse
} from './types';

/**
 * Gemini-specific implementation
 */
export class GeminiAIService implements AIService {
  private apiKey: string;
  private available: boolean = false;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.available = this.apiKey.length > 0;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async analyzeRisk(context: RiskContext): Promise<AIRiskAnalysis> {
    const startTime = Date.now();

    if (!this.available) {
      // Fallback: return risks unchanged
      return {
        risks: context.risks,
        insights: {
          summary: 'AI analysis unavailable (GEMINI_API_KEY not configured).',
          keyFactors: [],
          confidence: 0
        },
        metadata: {
          provider: 'gemini',
          latencyMs: Date.now() - startTime
        }
      };
    }

    try {
      // Dynamic import to avoid loading gemini-client if not needed
      const { analyzeRiskWithContext } = await import('@geo-lens/gemini-client');

      // Convert RiskContext to legacy format expected by gemini-client
      const legacyContext = {
        slopeMean: context.features.slope || 0,
        landslideHistory: context.risks.landslide.mean > 0.7 ? 'HIGH' : 'UNKNOWN'
      };

      // Call Gemini (note: this currently expects image buffer, we'll pass null)
      const result = await analyzeRiskWithContext(
        context.h3Index,
        null as any, // TODO: handle imagery when available
        legacyContext,
        this.apiKey
      );

      // Build AI-enhanced response
      const keyFactors: string[] = [];
      if (context.features.slope && context.features.slope > 30) {
        keyFactors.push(`Steep slope (${context.features.slope.toFixed(1)}°)`);
      }
      if (context.features.hazardPGA && context.features.hazardPGA > 0.2) {
        keyFactors.push(`High seismic hazard (PGA ${context.features.hazardPGA.toFixed(2)}g)`);
      }
      if (context.features.rain24h && context.features.rain24h > 40) {
        keyFactors.push(`Heavy rainfall (${context.features.rain24h.toFixed(0)}mm/24h)`);
      }

      return {
        risks: context.risks, // Unchanged - AI doesn't compute risks
        insights: {
          summary: result.reasoning || 'AI analysis completed.',
          keyFactors,
          confidence: result.confidence || 0.7,
          visualConfirmation: result.visualConfirmation ? {
            confirmed: result.visualConfirmation === 'CONFIRMED',
            details: result.reasoning || '',
            confidenceBoost: 0.1
          } : undefined,
          recommendations: [
            'Monitor rainfall trends for landslide triggers',
            'Consider seismic site effects for infrastructure planning'
          ]
        },
        metadata: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          latencyMs: Date.now() - startTime
        }
      };

    } catch (error) {
      console.error('[GeminiAI] Analysis failed:', error);

      // Graceful degradation
      return {
        risks: context.risks,
        insights: {
          summary: `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          keyFactors: [],
          confidence: 0
        },
        metadata: {
          provider: 'gemini',
          latencyMs: Date.now() - startTime
        }
      };
    }
  }

  async chat(
    history: ChatMessage[],
    userMessage: string,
    context?: string
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    if (!this.available) {
      return {
        message: 'AI chat unavailable (GEMINI_API_KEY not configured).',
        metadata: {
          provider: 'gemini',
          latencyMs: Date.now() - startTime
        }
      };
    }

    try {
      const { chatWithMap } = await import('@geo-lens/gemini-client');

      // Convert ChatMessage[] to legacy format
      const legacyHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const response = await chatWithMap(
        legacyHistory,
        userMessage,
        context || '',
        this.apiKey
      );

      return {
        message: response,
        suggestions: [
          'What are the landslide risk factors in this area?',
          'How does seismic hazard vary across the region?',
          'Explain the water stress indicators'
        ],
        metadata: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          latencyMs: Date.now() - startTime
        }
      };

    } catch (error) {
      console.error('[GeminiAI] Chat failed:', error);

      return {
        message: `AI chat error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          provider: 'gemini',
          latencyMs: Date.now() - startTime
        }
      };
    }
  }

  getProvider(): 'gemini' {
    return 'gemini';
  }
}
