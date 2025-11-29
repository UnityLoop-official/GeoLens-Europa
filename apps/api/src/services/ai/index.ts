/**
 * AI Service Factory
 *
 * Provides a unified interface to AI services with automatic provider selection.
 *
 * PRINCIPLES:
 * - Core works without AI (graceful degradation)
 * - Provider auto-detection from env vars
 * - Easy to add new providers (OpenAI, Claude, local models)
 */

import { AIService, NoOpAIService } from './types';
import { GeminiAIService } from './gemini';

export * from './types';
export { GeminiAIService } from './gemini';

/**
 * Create AI service instance based on available configuration
 *
 * Priority order:
 * 1. Gemini (if GEMINI_API_KEY present)
 * 2. OpenAI (if OPENAI_API_KEY present) - TODO
 * 3. Claude (if ANTHROPIC_API_KEY present) - TODO
 * 4. Local model (if LOCAL_AI_URL present) - TODO
 * 5. NoOp (fallback - core works without AI)
 *
 * @returns AIService instance (never null)
 */
export function createAIService(): AIService {
  // Try Gemini
  if (process.env.GEMINI_API_KEY) {
    console.log('[AI] Using Gemini AI service');
    return new GeminiAIService(process.env.GEMINI_API_KEY);
  }

  // Try OpenAI (future)
  if (process.env.OPENAI_API_KEY) {
    console.log('[AI] OpenAI support coming soon - using NoOp for now');
    // return new OpenAIService(process.env.OPENAI_API_KEY);
  }

  // Try Claude (future)
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[AI] Claude support coming soon - using NoOp for now');
    // return new ClaudeAIService(process.env.ANTHROPIC_API_KEY);
  }

  // Try Local model (future)
  if (process.env.LOCAL_AI_URL) {
    console.log('[AI] Local AI support coming soon - using NoOp for now');
    // return new LocalAIService(process.env.LOCAL_AI_URL);
  }

  // Fallback: NoOp (core works without AI)
  console.log('[AI] No AI provider configured - using NoOp (core functionality available)');
  return new NoOpAIService();
}

/**
 * Global AI service instance (singleton)
 *
 * Created once at server startup, reused for all requests.
 * This avoids recreating the service on every request.
 */
let aiServiceInstance: AIService | null = null;

/**
 * Get or create AI service singleton
 */
export function getAIService(): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}

/**
 * Reset AI service (useful for testing or config reload)
 */
export function resetAIService(): void {
  aiServiceInstance = null;
}
