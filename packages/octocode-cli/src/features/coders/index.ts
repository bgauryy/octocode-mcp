/**
 * Coders Module - Modular agent system
 *
 * Exports all coder types and factory functions for creating
 * specialized agent instances.
 *
 * Two approaches available:
 * 1. Legacy: Claude SDK-based coders (BaseCoder, ResearchCoder, etc.)
 * 2. Unified: Provider-agnostic coders (UnifiedCoder) - works with any LLM
 */

// Types
export * from './types.js';

// Base coder (legacy - Claude SDK)
export { BaseCoder } from './base-coder.js';

// Specialized coders (legacy - Claude SDK)
export { ResearchCoder, createResearchCoder } from './research-coder.js';
export { CodingCoder, createCodingCoder } from './coding-coder.js';
export { FullCoder, createFullCoder } from './full-coder.js';
export { PlanningCoder, createPlanningCoder } from './planning-coder.js';

// Unified coder (provider-agnostic - works with any LLM)
export {
  UnifiedCoder,
  createResearchCoder as createUnifiedResearchCoder,
  createCodingCoder as createUnifiedCodingCoder,
  createFullCoder as createUnifiedFullCoder,
  createPlanningCoder as createUnifiedPlanningCoder,
  type UnifiedCoderConfig,
} from './unified-coder.js';

// ============================================
// Coder Factory
// ============================================

import type { CoderMode, CoderConfig, ICoder } from './types.js';
import { UnifiedCoder, type UnifiedCoderConfig } from './unified-coder.js';

/**
 * Create a coder instance based on mode
 *
 * Now uses UnifiedCoder (provider-agnostic) which works with:
 * - Claude Code OAuth (automatic detection)
 * - ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, etc.
 * - Any Vercel AI SDK compatible provider
 */
export function createCoder(
  mode: CoderMode,
  config: Partial<CoderConfig> = {}
): ICoder {
  // Convert CoderConfig to UnifiedCoderConfig
  const unifiedConfig: Partial<UnifiedCoderConfig> = {
    ...config,
    mode,
  };

  return new UnifiedCoder(mode, unifiedConfig);
}

/**
 * Get available coder modes
 */
export function getCoderModes(): CoderMode[] {
  return ['research', 'coding', 'full', 'planning', 'custom'];
}

/**
 * Get mode description
 */
export function getModeDescription(mode: CoderMode): {
  name: string;
  icon: string;
  description: string;
} {
  const descriptions: Record<
    CoderMode,
    { name: string; icon: string; description: string }
  > = {
    research: {
      name: 'Research',
      icon: '🔍',
      description: 'Explore & analyze codebases',
    },
    coding: {
      name: 'Coding',
      icon: '💻',
      description: 'Write & edit code',
    },
    full: {
      name: 'Full',
      icon: '🚀',
      description: 'All capabilities enabled',
    },
    planning: {
      name: 'Planning',
      icon: '📋',
      description: 'Create detailed plans',
    },
    custom: {
      name: 'Custom',
      icon: '⚙️',
      description: 'Manual configuration',
    },
  };
  return descriptions[mode];
}
