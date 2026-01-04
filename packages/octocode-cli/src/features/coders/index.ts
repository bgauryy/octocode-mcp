/**
 * Coders Module - Modular agent system
 *
 * Exports all coder types and factory functions for creating
 * specialized agent instances.
 */

// Types
export * from './types.js';

// Base coder
export { BaseCoder } from './base-coder.js';

// Specialized coders
export { ResearchCoder, createResearchCoder } from './research-coder.js';
export { CodingCoder, createCodingCoder } from './coding-coder.js';
export { FullCoder, createFullCoder } from './full-coder.js';
export { PlanningCoder, createPlanningCoder } from './planning-coder.js';

// ============================================
// Coder Factory
// ============================================

import type { CoderMode, CoderConfig, ICoder } from './types.js';
import { ResearchCoder } from './research-coder.js';
import { CodingCoder } from './coding-coder.js';
import { FullCoder } from './full-coder.js';
import { PlanningCoder } from './planning-coder.js';

/**
 * Create a coder instance based on mode
 */
export function createCoder(
  mode: CoderMode,
  config: Partial<CoderConfig> = {}
): ICoder {
  switch (mode) {
    case 'research':
      return new ResearchCoder(config);
    case 'coding':
      return new CodingCoder(config);
    case 'full':
      return new FullCoder(config);
    case 'planning':
      return new PlanningCoder(config);
    case 'custom':
      // Custom mode uses full coder with custom config
      return new FullCoder(config);
    default:
      throw new Error(`Unknown coder mode: ${mode}`);
  }
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
