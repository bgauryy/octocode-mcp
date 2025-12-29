/**
 * Dynamic, context-aware hints for tools
 * Provides intelligent hints based on runtime context
 * @module hints/dynamic
 */

import { STATIC_TOOL_NAMES } from '../toolMetadata.js';
import type { HintContext, HintStatus, ToolHintGenerators } from './types.js';

/**
 * Smart, reasoning-based hints for each tool
 * Keys are actual tool names from STATIC_TOOL_NAMES
 */
export const HINTS: Record<string, ToolHintGenerators> = {
  [STATIC_TOOL_NAMES.LOCAL_RIPGREP]: {
    hasResults: (ctx: HintContext = {}) => [
      'Next: FETCH_CONTENT for context (prefer matchString).',
      'Also search imports/usages/defs with RIPGREP.',
      ctx.fileCount && ctx.fileCount > 5
        ? 'Tip: run queries in parallel.'
        : undefined,
    ],

    empty: (_ctx: HintContext = {}) => [
      'No matches. Broaden scope (noIgnore, hidden) or use fixedString.',
      'Unsure of paths? VIEW_STRUCTURE or FIND_FILES.',
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          'Add type/path filters to focus.',
          ctx.path?.includes('node_modules')
            ? 'In node_modules, target specific packages.'
            : undefined,
          'Names only? Use FIND_FILES.',
          'Flow: filesOnly=true \u2192 refine \u2192 read.',
        ];
      }
      return ['Tool unavailable; try FIND_FILES or VIEW_STRUCTURE.'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT]: {
    hasResults: (_ctx: HintContext = {}) => [
      'Next: trace imports/usages with RIPGREP.',
      'Open related files (tests/types/impl) together.',
      'Prefer matchString over full file.',
    ],

    empty: (_ctx: HintContext = {}) => [
      'No match/file. Check path/pattern.',
      'Locate via FIND_FILES (name) or RIPGREP (filesOnly for paths).',
    ],

    error: (ctx: HintContext = {}) => {
      if (
        ctx.errorType === 'size_limit' &&
        ctx.isLarge &&
        !ctx.hasPagination &&
        !ctx.hasPattern
      ) {
        return [
          ctx.fileSize
            ? `Large file (~${Math.round(ctx.fileSize * 0.25)}K tokens).`
            : 'Large file.',
          'Use matchString for sections, or charLength to paginate.',
          'Avoid fullContent without pagination.',
        ];
      }

      if (ctx.errorType === 'pattern_too_broad') {
        return [
          ctx.tokenEstimate
            ? `Pattern too broad (~${ctx.tokenEstimate.toLocaleString()} tokens).`
            : 'Pattern too broad.',
          'Tighten pattern or paginate with charLength.',
        ];
      }

      return ['Unknown path; find via FIND_FILES or RIPGREP.'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE]: {
    hasResults: (ctx: HintContext = {}) => [
      'Next: RIPGREP for patterns; FIND_FILES for filters.',
      'Drill deeper with depth=2 when needed.',
      ctx.entryCount && ctx.entryCount > 10
        ? 'Parallelize across directories.'
        : undefined,
    ],

    empty: (_ctx: HintContext = {}) => [
      'Empty/missing. Use hidden=true or check parent.',
      'Discover dirs with FIND_FILES type="d".',
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit' && ctx.entryCount) {
        return [
          `Directory has ${ctx.entryCount} entries${ctx.tokenEstimate ? ` (~${ctx.tokenEstimate.toLocaleString()} tokens)` : ''}. Use entriesPerPage.`,
          'Sort by recent; scan page by page.',
        ];
      }
      return ['Access failed; locate dirs with FIND_FILES type="d".'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FIND_FILES]: {
    hasResults: (ctx: HintContext = {}) => [
      'Found files. Next: FETCH_CONTENT or RIPGREP.',
      'Use modifiedWithin="7d" to track recent changes.',
      ctx.fileCount && ctx.fileCount > 3 ? 'Batch in parallel.' : undefined,
    ],

    empty: (_ctx: HintContext = {}) => [
      'No matches. Broaden iname, increase maxDepth, relax filters.',
      'Or use VIEW_STRUCTURE/RIPGREP.',
      'Syntax: time "7d", size "10M".',
    ],

    error: (_ctx: HintContext = {}) => [
      'Search failed; try VIEW_STRUCTURE or RIPGREP.',
    ],
  },

  [STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    hasResults: (ctx: HintContext = {}) => {
      // Context-aware hints based on single vs multi-repo results
      const hints: (string | undefined)[] = [];
      if (ctx.hasOwnerRepo) {
        hints.push(
          'Result is from single repo. Use githubGetFileContent with path.'
        );
      } else {
        hints.push(
          'Results from multiple repos. Check owners/repos before fetching.'
        );
      }
      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      // Context-aware hints - static hints cover generic cases
      const hints: (string | undefined)[] = [];

      // Path-specific guidance when match="path" returns empty
      if (ctx.match === 'path') {
        hints.push(
          'match="path" searches file/directory NAMES only, not contents.'
        );
        hints.push(
          'No paths contain this keyword. Try match="file" to search content instead.'
        );
      } else if (!ctx.hasOwnerRepo) {
        hints.push('Cross-repo search requires unique keywords (3+ chars).');
      }
      // Note: "Try semantic variants" is in static hints, not duplicated here
      return hints;
    },
    error: (_ctx: HintContext = {}) => [],
  },

  [STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    hasResults: (ctx: HintContext = {}) => [
      // Only add context-aware hints, static hints come from content.json
      ctx.isLarge
        ? 'Large file - use matchString to target specific sections'
        : undefined,
    ],
    empty: (_ctx: HintContext = {}) => [
      // Static hints cover the common cases, no dynamic hints needed
    ],
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          'FILE_TOO_LARGE: Use matchString or startLine/endLine for partial reads',
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    hasResults: (ctx: HintContext = {}) => [
      // Only add context-aware hints based on entry count
      ctx.entryCount && ctx.entryCount > 50
        ? `Large directory (${ctx.entryCount} entries) - use entriesPerPage to paginate`
        : undefined,
    ],
    empty: (_ctx: HintContext = {}) => [
      // Static hints cover the common cases
    ],
    error: (_ctx: HintContext = {}) => [],
  },

  [STATIC_TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    // Note: Static hints already cover all common cases including "Multiple PRs? Look for patterns"
    // Dynamic hints only for truly context-specific scenarios not covered by static
    hasResults: (_ctx: HintContext = {}) => [],
    empty: (_ctx: HintContext = {}) => [],
    error: (_ctx: HintContext = {}) => [],
  },
};

/**
 * Tool names that have dynamic hint generators
 */
export type DynamicToolName = keyof typeof HINTS;

/**
 * Check if a tool has dynamic hint generators
 */
export function hasDynamicHints(toolName: string): toolName is DynamicToolName {
  return toolName in HINTS;
}

/**
 * Get dynamic, context-aware hints for a tool
 *
 * @param toolName - The tool name
 * @param status - The result status
 * @param context - Optional context for smarter hints
 * @returns Array of context-aware hints
 */
export function getDynamicHints(
  toolName: string,
  status: HintStatus,
  context?: HintContext
): string[] {
  const hintGenerator = HINTS[toolName]?.[status];
  if (!hintGenerator) return [];

  // Call the hint generator with context
  const rawHints = hintGenerator(context || {});

  // Filter out undefined values from conditional hints
  return rawHints.filter((h): h is string => typeof h === 'string');
}

/**
 * Get adaptive workflow guidance for large files/directories
 * Explains reasoning behind chunking strategies
 *
 * @param context - Whether for 'search' (ripgrep) or 'read' (fetch_content)
 * @returns Intelligent workflow guidance with reasoning
 */
export function getLargeFileWorkflowHints(
  context: 'search' | 'read'
): string[] {
  if (context === 'search') {
    return [
      'Large codebase: avoid floods.',
      'Flow: RIPGREP filesOnly \u2192 add type/path filters \u2192 FETCH_CONTENT matchString \u2192 RIPGREP links.',
      'Parallelize where safe.',
    ];
  }
  return [
    "Large file: don't read all.",
    'Flow: FETCH_CONTENT matchString \u2192 analyze \u2192 RIPGREP usages/imports \u2192 FETCH_CONTENT related.',
    'Use charLength to paginate if needed.',
    'Avoid fullContent without charLength.',
  ];
}
