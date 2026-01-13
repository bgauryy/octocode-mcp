/**
 * Dynamic hints for githubSearchCode tool
 * @module tools/github_search_code/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubSearchCode';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    // Context-aware hints based on single vs multi-repo results
    const hints: (string | undefined)[] = [];
    if (ctx.hasOwnerRepo) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'singleRepo'));
    } else {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'multiRepo'));
    }
    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    // Context-aware hints - static hints cover generic cases
    const hints: (string | undefined)[] = [];

    // Path-specific guidance when match="path" returns empty
    if (ctx.match === 'path') {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'pathEmpty'));
    } else if (!ctx.hasOwnerRepo) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'crossRepoEmpty'));
    }
    // Note: "Try semantic variants" is in static hints, not duplicated here
    return hints;
  },

  error: (_ctx: HintContext = {}) => [],
};
