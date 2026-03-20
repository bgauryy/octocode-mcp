/**
 * Dynamic hints for githubGetFileContent tool
 * @module tools/github_fetch_content/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

const TOOL_NAME = 'githubGetFileContent';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.isLarge) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'largeFile'));
    }
    const c = ctx as Record<string, unknown>;
    if (c.isPartial && typeof c.endLine === 'number') {
      hints.push(
        `Partial content ends at line ${c.endLine}. Use startLine=${c.endLine + 1} to continue.`
      );
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
