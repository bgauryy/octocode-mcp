/**
 * Dynamic hints for lspFindReferences tool
 * @module tools/lsp_find_references/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'lspFindReferences';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    // Only context-aware hints - base hints come from HOST static hints
    const hints: (string | undefined)[] = [];
    const locationCount = (ctx as Record<string, unknown>).locationCount as
      | number
      | undefined;
    const fileCount = (ctx as Record<string, unknown>).fileCount;
    const currentPage = (ctx as Record<string, unknown>).currentPage as
      | number
      | undefined;
    const totalPages = (ctx as Record<string, unknown>).totalPages;

    if (locationCount && locationCount > 20) {
      hints.push(`Found ${locationCount} references.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'manyReferences'));
    }
    if ((ctx as Record<string, unknown>).hasMultipleFiles) {
      hints.push(`References span ${fileCount || 'multiple'} files.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'multipleFiles'));
    }
    if ((ctx as Record<string, unknown>).hasMorePages) {
      hints.push(`Page ${currentPage}/${totalPages}.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'pagination'));
    }
    if ((ctx as Record<string, unknown>).isFallback) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'fallbackMode'));
    }
    if ((ctx as Record<string, unknown>).isFiltered) {
      const filtered = (ctx as Record<string, unknown>).filteredCount as
        | number
        | undefined;
      const total = (ctx as Record<string, unknown>).totalUnfiltered as
        | number
        | undefined;
      if (filtered !== undefined && total !== undefined) {
        hints.push(
          `Filtered: ${filtered} of ${total} total references match patterns.`
        );
      }
      hints.push(
        'Use includePattern/excludePattern to narrow results by file path.'
      );
    }
    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    // Only context-aware hints - base hints come from HOST static hints
    const hints: (string | undefined)[] = [];
    if ((ctx as Record<string, unknown>).symbolName) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'symbolNotFound'));
    }
    if ((ctx as Record<string, unknown>).filteredAll) {
      hints.push(
        'All references were excluded by file patterns. Try broader patterns or remove filtering.'
      );
    }
    if (!(ctx as Record<string, unknown>).filteredAll) {
      hints.push(
        'TIP: Use includePattern to search only specific files (e.g. ["**/*.test.ts"]).'
      );
      hints.push(
        'TIP: Use excludePattern to skip files (e.g. ["**/node_modules/**", "**/dist/**"]).'
      );
    }
    return hints;
  },

  error: (ctx: HintContext = {}) => {
    if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
      return [...getMetadataDynamicHints(TOOL_NAME, 'symbolNotFound')];
    }
    if ((ctx as Record<string, unknown>).errorType === 'timeout') {
      return [...getMetadataDynamicHints(TOOL_NAME, 'timeout')];
    }
    return [];
  },
};
