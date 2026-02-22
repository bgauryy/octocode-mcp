/**
 * Dynamic hints for lspCallHierarchy tool
 * @module tools/lsp_call_hierarchy/hints
 *
 * API dynamic keys available: incomingResults, outgoingResults, notAFunction,
 * timeout, entryPoint, leafNode, flowComplete
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'lspCallHierarchy';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
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

    // Depth inline hint (no API key available)
    if (depth && depth > 1) {
      hints.push(`Depth=${depth} showing ${depth}-level call chain.`);
    }

    // Pagination inline hint (no API key available)
    if ((ctx as Record<string, unknown>).hasMorePages) {
      hints.push(`Page ${currentPage}/${totalPages}.`);
    }

    return hints;
  },

  empty: (_ctx: HintContext = {}) => [],

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
