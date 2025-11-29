/**
 * AI Service Abstraction Layer
 *
 * DESIGN PRINCIPLES:
 * - AI is OPTIONAL - core must work without it
 * - Provider-agnostic (Gemini, OpenAI, Claude, local models)
 * - AI enhances, doesn't compute (risk computation stays in risk-engine)
 * - Graceful degradation when API key missing or service unavailable
 *
 * USE CASES:
 * 1. Risk explanation enhancement (AI rephrases technical output)
 * 2. Visual analysis (satellite/drone imagery → risk confirmation)
 * 3. Conversational interface (chat about map/risks)
 * 4. Pattern recognition (identify anomalies in risk patterns)
 *
 * NON-USE CASES (AI should NOT):
 * - Compute risk scores (that's risk-engine's job)
 * - Replace datacube (that's for data storage)
 * - Be required for core functionality
 */

/**
 * Risk context for AI analysis
 */
export interface RiskContext {
  h3Index: string;

  /** Cell features (from datacube/adapters) */
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
    landslide: {
      mean: number;
      confidence: number;
      explanation?: string;
    };
    seismic: {
      mean: number;
      confidence: number;
      explanation?: string;
    };
    water: {
      mean: number;
      confidence: number;
      isPlaceholder?: boolean;
      explanation?: string;
    };
    mineral: {
      mean: number;
      confidence: number;
      isPlaceholder?: boolean;
      explanation?: string;
    };
  };

  /** Optional: historical data, trends */
  temporal?: {
    rainfallTrend?: 'increasing' | 'stable' | 'decreasing';
    recentEvents?: string[];
  };

  /** Optional: visual data (satellite imagery, photos) */
  imagery?: {
    satelliteUrl?: string;
    dronePhotoUrl?: string;
    base64Image?: string;
  };
}

/**
 * AI-enhanced risk analysis result
 */
export interface AIRiskAnalysis {
  /** Original risk scores (unchanged by AI) */
  risks: RiskContext['risks'];

  /** AI-generated insights */
  insights: {
    /** Plain-language summary */
    summary: string;

    /** Key risk factors identified by AI */
    keyFactors: string[];

    /** Confidence in AI analysis (0-1) */
    confidence: number;

    /** Visual confirmation (if imagery provided) */
    visualConfirmation?: {
      confirmed: boolean;
      details: string;
      confidenceBoost: number; // How much imagery increases confidence
    };

    /** Recommendations (AI-generated) */
    recommendations?: string[];
  };

  /** Provider metadata */
  metadata: {
    provider: 'gemini' | 'openai' | 'claude' | 'local' | 'none';
    model?: string;
    tokensUsed?: number;
    costUSD?: number;
    latencyMs: number;
  };
}

/**
 * Chat message for conversational AI
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Chat response from AI
 */
export interface ChatResponse {
  message: string;

  /** Suggested follow-up questions */
  suggestions?: string[];

  /** Provider metadata */
  metadata: {
    provider: 'gemini' | 'openai' | 'claude' | 'local' | 'none';
    model?: string;
    tokensUsed?: number;
    latencyMs: number;
  };
}

/**
 * AI Service Interface
 *
 * All AI providers must implement this interface.
 * Implementations should handle API key validation and graceful degradation.
 */
export interface AIService {
  /**
   * Check if service is available (API key present, network reachable)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Analyze risk with AI enhancement
   *
   * @param context - Risk context with features and computed risks
   * @returns AI-enhanced analysis (or graceful fallback)
   */
  analyzeRisk(context: RiskContext): Promise<AIRiskAnalysis>;

  /**
   * Chat about map/risks
   *
   * @param history - Previous messages
   * @param userMessage - New user message
   * @param context - Optional map context (current view, selected cell)
   * @returns AI response
   */
  chat(
    history: ChatMessage[],
    userMessage: string,
    context?: string
  ): Promise<ChatResponse>;

  /**
   * Get provider name
   */
  getProvider(): 'gemini' | 'openai' | 'claude' | 'local' | 'none';
}

/**
 * Fallback AI service (no-op, used when no provider available)
 */
export class NoOpAIService implements AIService {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async analyzeRisk(context: RiskContext): Promise<AIRiskAnalysis> {
    // Return risks unchanged, no AI insights
    return {
      risks: context.risks,
      insights: {
        summary: 'AI analysis unavailable. Risk scores computed by deterministic engine.',
        keyFactors: [],
        confidence: 0,
        recommendations: [
          'AI enhancement disabled - core risk computation working normally',
          'To enable AI insights, configure GEMINI_API_KEY or other AI provider'
        ]
      },
      metadata: {
        provider: 'none',
        latencyMs: 0
      }
    };
  }

  async chat(
    history: ChatMessage[],
    userMessage: string,
    context?: string
  ): Promise<ChatResponse> {
    return {
      message: 'AI chat is unavailable. Please configure an AI provider (GEMINI_API_KEY) to enable conversational features.',
      suggestions: [
        'View risk distributions without AI',
        'Explore map data layers',
        'Query specific H3 cells'
      ],
      metadata: {
        provider: 'none',
        latencyMs: 0
      }
    };
  }

  getProvider(): 'none' {
    return 'none';
  }
}
