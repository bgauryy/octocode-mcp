/**
 * Dynamic hints for localSearchCode (ripgrep) tool
 * @module tools/local_ripgrep/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const LOCAL_BASE_HINTS = {
  hasResults: [
    "Follow 'mainResearchGoal', 'researchGoal', 'reasoning', 'hints' to navigate research",
    'Do findings answer your question? If partial, identify gaps and continue',
    'Got 3+ examples? Consider stopping to avoid over-research',
    'Check last modified dates - skip stale content',
  ],
  empty: [
    'Try broader terms or related concepts',
    'Remove filters one at a time to find what blocks results',
    'Separate concerns into multiple simpler queries',
    '<AGENT_INSTRUCTION>If stuck in loop - STOP and ask user</AGENT_INSTRUCTION>',
  ],
} as const;

export const TOOL_NAME = 'localSearchCode';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.searchEngine === 'grep') {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'grepFallback'));
    }
    if (ctx.fileCount && ctx.fileCount > 5) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'parallelTip'));
    }
    if (ctx.fileCount && ctx.fileCount > 1) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'multipleFiles'));
    }
    return hints;
  },

  empty: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.searchEngine === 'grep') {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'grepFallbackEmpty'));
    }
    return hints;
  },

  error: (ctx: HintContext = {}) => {
    if (ctx.errorType === 'size_limit') {
      return [
        `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
        ...(ctx.path?.includes('node_modules')
          ? getMetadataDynamicHints(TOOL_NAME, 'nodeModulesSearch')
          : []),
        ...getMetadataDynamicHints(TOOL_NAME, 'largeResult'),
      ];
    }
    return [];
  },
};
