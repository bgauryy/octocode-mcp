/**
 * Dynamic hints for githubGetFileContent tool
 * @module tools/github_fetch_content/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubGetFileContent';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    // Only add context-aware hints, static hints come from content.json
    const hints: (string | undefined)[] = [];
    if (ctx.isLarge) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'largeFile'));
    }
    return hints;
  },

  empty: (_ctx: HintContext = {}) => [
    // Static hints cover the common cases, no dynamic hints needed
  ],

  error: (ctx: HintContext = {}) => {
    if (ctx.errorType === 'size_limit') {
      return [...getMetadataDynamicHints(TOOL_NAME, 'fileTooLarge')];
    }
    return [];
  },
};
