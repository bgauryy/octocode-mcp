/**
 * Unified hints system for all tools
 *
 * Combines:
 * - Static hints from content.json (via toolMetadata)
 * - Dynamic hints (context-aware, generated at runtime)
 *
 * @module hints
 */

import { getStaticHints } from './static.js';
import { getDynamicHints, hasDynamicHints } from './dynamic.js';
import type { HintContext, HintStatus } from './types.js';

// Re-export types for convenience
export type {
  HintContext,
  HintStatus,
  HintGenerator,
  ToolHintGenerators,
} from './types.js';

// Re-export utility functions and HINTS object
export {
  hasDynamicHints,
  getLargeFileWorkflowHints,
  HINTS,
} from './dynamic.js';

/**
 * Get unified hints for a tool
 *
 * This is the main entry point for hint generation. It combines:
 * 1. Static hints from content.json (base + tool-specific)
 * 2. Dynamic hints (context-aware, generated at runtime)
 *
 * Hints are deduplicated to avoid repetition.
 *
 * @param toolName - The tool name (e.g., 'githubSearchCode', 'localSearchCode')
 * @param status - The result status ('hasResults', 'empty', 'error')
 * @param context - Optional context for generating smarter hints
 * @returns Array of deduplicated hint strings
 *
 * @example
 * // Basic usage
 * const hints = getHints('githubSearchCode', 'hasResults');
 *
 * @example
 * // With context for smarter hints
 * const hints = getHints('localSearchCode', 'hasResults', {
 *   fileCount: 15,
 *   matchCount: 250
 * });
 *
 * @example
 * // Error hints with context
 * const hints = getHints('localGetFileContent', 'error', {
 *   errorType: 'size_limit',
 *   fileSize: 500, // KB
 *   isLarge: true
 * });
 */
export function getHints(
  toolName: string,
  status: HintStatus,
  context?: HintContext
): string[] {
  const staticHints = getStaticHints(toolName, status);

  const dynamicHints = hasDynamicHints(toolName)
    ? getDynamicHints(toolName, status, context)
    : [];

  const allHints = [...staticHints, ...dynamicHints];
  return [...new Set(allHints)];
}

/**
 * Legacy alias for getHints - for backward compatibility
 * @deprecated Use getHints instead
 */
export const getToolHints = getHints;
