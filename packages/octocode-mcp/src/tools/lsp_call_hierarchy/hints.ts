/**
 * Dynamic hints for lspCallHierarchy tool
 * @module tools/lsp_call_hierarchy/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'lspCallHierarchy';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    // Only context-aware hints - base hints come from HOST static hints
    const hints: (string | undefined)[] = [];
    const direction = (ctx as Record<string, unknown>).direction;
    const callCount = (ctx as Record<string, unknown>).callCount;
    const depth = (ctx as Record<string, unknown>).depth as number | undefined;
    const currentPage = (ctx as Record<string, unknown>).currentPage as
      | number
      | undefined;
    const totalPages = (ctx as Record<string, unknown>).totalPages;

    // Direction-based hints
    if (direction === 'incoming') {
      hints.push(`Found ${callCount || 'multiple'} callers.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'incomingResults'));
    } else {
      hints.push(`Found ${callCount || 'multiple'} callees.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'outgoingResults'));
    }

    // Depth hints
    if (depth && depth > 1) {
      hints.push(`Depth=${depth} showing ${depth}-level call chain.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'deepChain'));
    }

    // Pagination hints
    if ((ctx as Record<string, unknown>).hasMorePages) {
      hints.push(`Page ${currentPage}/${totalPages}.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'pagination'));
    }

    // Fallback hints
    if ((ctx as Record<string, unknown>).isFallback) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'fallbackMode'));
    }

    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    // Only context-aware hints - base hints come from HOST static hints
    const hints: (string | undefined)[] = [];
    const direction = (ctx as Record<string, unknown>).direction;

    if (direction === 'incoming') {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'noCallers'));
    } else {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'noCallees'));
    }

    return hints;
  },

  error: (ctx: HintContext = {}) => {
    const depth = (ctx as Record<string, unknown>).depth;

    if ((ctx as Record<string, unknown>).errorType === 'not_a_function') {
      return [...getMetadataDynamicHints(TOOL_NAME, 'notAFunction')];
    }
    if ((ctx as Record<string, unknown>).errorType === 'timeout') {
      return [
        `Depth=${depth} caused timeout.`,
        ...getMetadataDynamicHints(TOOL_NAME, 'timeout'),
      ];
    }
    return [];
  },
};
