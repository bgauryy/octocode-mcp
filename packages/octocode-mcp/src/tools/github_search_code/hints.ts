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

  error: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];

    // Rate limit specific hints
    if (ctx.isRateLimited) {
      hints.push(
        `Rate limited. ${ctx.retryAfter ? `Retry after ${ctx.retryAfter}s.` : 'Wait before retrying.'}`
      );
      hints.push(
        'Consider: Use a different token, reduce request frequency, or use pagination.'
      );
    }

    // Authentication hints
    if (ctx.status === 401) {
      hints.push('Check GITHUB_TOKEN is valid and not expired.');
    }

    // Permission hints
    if (ctx.status === 403 && !ctx.isRateLimited) {
      hints.push(
        'Check token permissions. Required scopes: repo (for private repos).'
      );
    }

    return hints;
  },
};
