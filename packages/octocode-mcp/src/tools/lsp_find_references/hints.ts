/**
 * Dynamic hints for lspFindReferences tool
 * @module tools/lsp_find_references/hints
 *
 * NOTE: lspReferencesCore.ts and lspReferencesPatterns.ts build hints inline
 * and do not pass hintContext to getHints(). Dynamic branches here only fire
 * if a future caller wires up the context. Static hints come from the API.
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'lspFindReferences';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    const locationCount = (ctx as Record<string, unknown>).locationCount as
      | number
      | undefined;
    const fileCount = (ctx as Record<string, unknown>).fileCount;

    if (locationCount && locationCount > 20) {
      hints.push(`Found ${locationCount} references.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'manyReferences'));
    }
    if ((ctx as Record<string, unknown>).hasMultipleFiles) {
      hints.push(`References span ${fileCount || 'multiple'} files.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'multipleFiles'));
    }
    if ((ctx as Record<string, unknown>).isFallback) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'fallbackMode'));
    }
    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if ((ctx as Record<string, unknown>).symbolName) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'symbolNotFound'));
    }
    if ((ctx as Record<string, unknown>).filteredAll) {
      hints.push(
        'All references were excluded by file patterns. Try broader patterns or remove filtering.'
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
