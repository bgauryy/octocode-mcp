/**
 * Shared types for the unified hints system
 * Re-exports from centralized metadata types
 * @module hints/types
 */

// Re-export all hint types from the centralized location
export type {
  HintContext,
  HintStatus,
  HintGenerator,
  ToolHintGenerators,
} from '../../types/metadata.js';
