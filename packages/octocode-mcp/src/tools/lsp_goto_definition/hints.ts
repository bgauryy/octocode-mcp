/**
 * Dynamic hints for lspGotoDefinition tool
 * @module tools/lsp_goto_definition/hints
 *
 * API dynamic keys available: multipleDefinitions, externalPackage, symbolNotFound,
 * timeout, functionSymbol, typeOrVariable
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'lspGotoDefinition';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    const locationCount = (ctx as Record<string, unknown>).locationCount as
      | number
      | undefined;
    if (locationCount && locationCount > 1) {
      hints.push(`Found ${locationCount} definitions.`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'multipleDefinitions'));
    }
    if ((ctx as Record<string, unknown>).hasExternalPackage) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'externalPackage'));
    }
    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    const searchRadius = (ctx as Record<string, unknown>).searchRadius;
    const lineHint = (ctx as Record<string, unknown>).lineHint;
    if (searchRadius) {
      hints.push(
        `Searched ±${searchRadius} lines from lineHint=${lineHint}. Adjust hint.`
      );
    }
    if ((ctx as Record<string, unknown>).symbolName) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'symbolNotFound'));
    }
    return hints;
  },

  error: (ctx: HintContext = {}) => {
    const symbolName = (ctx as Record<string, unknown>).symbolName;
    const lineHint = (ctx as Record<string, unknown>).lineHint;
    const uri = (ctx as Record<string, unknown>).uri as string | undefined;

    if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
      return [
        `Symbol "${symbolName}" not found at line ${lineHint}.`,
        ...getMetadataDynamicHints(TOOL_NAME, 'symbolNotFound'),
      ];
    }
    if ((ctx as Record<string, unknown>).errorType === 'file_not_found') {
      return [`File not found: ${uri}`];
    }
    if ((ctx as Record<string, unknown>).errorType === 'timeout') {
      return [...getMetadataDynamicHints(TOOL_NAME, 'timeout')];
    }
    return [];
  },
};
