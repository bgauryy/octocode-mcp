/**
 * Dynamic hints for githubViewRepoStructure tool
 * @module tools/github_view_repo_structure/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubViewRepoStructure';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    // Only add context-aware hints based on entry count
    const hints: (string | undefined)[] = [];
    if (ctx.entryCount && ctx.entryCount > 50) {
      hints.push(`Large directory (${ctx.entryCount} entries).`);
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'largeDirectory'));
    }
    return hints;
  },

  empty: (_ctx: HintContext = {}) => [
    // Static hints cover the common cases
  ],

  error: (_ctx: HintContext = {}) => [],
};
