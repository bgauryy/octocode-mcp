/**
 * Dynamic hints for localGetFileContent tool
 * @module tools/local_fetch_content/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'localGetFileContent';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => [
    (ctx as Record<string, unknown>).hasMoreContent
      ? 'More content available - use charOffset for pagination.'
      : undefined,
  ],

  empty: (_ctx: HintContext = {}) => [
    // Base hints come from HOST
  ],

  error: (ctx: HintContext = {}) => {
    if (ctx.errorType === 'size_limit' && ctx.isLarge) {
      return [
        ctx.fileSize
          ? `Large file (~${Math.round(ctx.fileSize * 0.25)}K tokens).`
          : undefined,
        ...getMetadataDynamicHints(TOOL_NAME, 'largeFile'),
      ];
    }

    if (ctx.errorType === 'pattern_too_broad') {
      return [
        ctx.tokenEstimate
          ? `Pattern too broad (~${ctx.tokenEstimate.toLocaleString()} tokens).`
          : undefined,
        ...getMetadataDynamicHints(TOOL_NAME, 'patternTooBroad'),
      ];
    }

    return [];
  },
};

/**
 * Get adaptive workflow guidance for large files
 * Explains reasoning behind chunking strategies
 */
export function getLargeFileWorkflowHints(): string[] {
  return [
    "Large file: don't read all.",
    'Flow: localGetFileContent matchString → analyze → localSearchCode usages/imports → localGetFileContent related.',
    'Use charLength to paginate if needed.',
    'Avoid fullContent without charLength.',
  ];
}
