/**
 * Centralized, context-aware hints for local file search tools
 * All hint generation logic lives here - tools only provide context
 *
 * Philosophy: Tools send context, hints generate reasoning
 * @module hints
 */

/**
 * Context that tools can provide to generate smarter hints
 */
export interface HintContext {
  // Size context
  fileSize?: number; // KB
  resultSize?: number; // chars
  tokenEstimate?: number; // estimated tokens
  entryCount?: number; // number of entries/files

  // Search context
  matchCount?: number; // number of matches
  fileCount?: number; // number of files
  isLarge?: boolean; // is result/file large?

  // Error context
  errorType?: 'size_limit' | 'not_found' | 'permission' | 'pattern_too_broad';
  originalError?: string;

  // Tool-specific context
  hasPattern?: boolean; // has matchString/pattern
  hasPagination?: boolean; // has charLength/pagination
  path?: string; // path being searched
}

/**
 * Smart, reasoning-based hints for each tool
 */
export const HINTS = {
  LOCAL_RIPGREP: {
    hasResults: (ctx: HintContext = {}) =>
      [
        'Next: FETCH_CONTENT for context (prefer matchString).',
        'Also search imports/usages/defs with RIPGREP.',
        ctx.fileCount && ctx.fileCount > 5
          ? 'Tip: run queries in parallel.'
          : undefined,
      ].filter(Boolean),

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
          'Flow: filesOnly=true → refine → read.',
        ].filter(Boolean);
      }
      return ['Tool unavailable; try FIND_FILES or VIEW_STRUCTURE.'];
    },
  },

  LOCAL_FETCH_CONTENT: {
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

  LOCAL_VIEW_STRUCTURE: {
    hasResults: (ctx: HintContext = {}) =>
      [
        'Next: RIPGREP for patterns; FIND_FILES for filters.',
        'Drill deeper with depth=2 when needed.',
        ctx.entryCount && ctx.entryCount > 10
          ? 'Parallelize across directories.'
          : undefined,
      ].filter(Boolean),

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

  LOCAL_FIND_FILES: {
    hasResults: (ctx: HintContext = {}) =>
      [
        'Found files. Next: FETCH_CONTENT or RIPGREP.',
        'Use modifiedWithin="7d" to track recent changes.',
        ctx.fileCount && ctx.fileCount > 3 ? 'Batch in parallel.' : undefined,
      ].filter(Boolean),

    empty: (_ctx: HintContext = {}) => [
      'No matches. Broaden iname, increase maxDepth, relax filters.',
      'Or use VIEW_STRUCTURE/RIPGREP.',
      'Syntax: time "7d", size "10M".',
    ],

    error: (_ctx: HintContext = {}) => [
      'Search failed; try VIEW_STRUCTURE or RIPGREP.',
    ],
  },
} as const;

export type ToolName = keyof typeof HINTS;
export type HintStatus = 'hasResults' | 'empty' | 'error';

/**
 * Get smart, context-aware hints
 *
 * @param toolName - Tool that was executed
 * @param status - Result status
 * @param context - Optional context to generate smarter hints
 * @returns Array of intelligent, context-aware hints
 */
export function getToolHints(
  toolName: ToolName,
  status: HintStatus,
  context?: HintContext
): string[] {
  const hintGenerator = HINTS[toolName]?.[status];
  if (!hintGenerator) return [];

  // Call the hint generator with context
  const rawHints =
    typeof hintGenerator === 'function'
      ? hintGenerator(context || {})
      : hintGenerator;

  // Ensure we return string[] (filter out undefined from conditional hints)
  const hints = Array.isArray(rawHints) ? rawHints : [rawHints];
  return hints.filter((h): h is string => typeof h === 'string');
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
      'Flow: RIPGREP filesOnly → add type/path filters → FETCH_CONTENT matchString → RIPGREP links.',
      'Parallelize where safe.',
    ];
  }
  return [
    "Large file: don't read all.",
    'Flow: FETCH_CONTENT matchString → analyze → RIPGREP usages/imports → FETCH_CONTENT related.',
    'Use charLength to paginate if needed.',
    'Avoid fullContent without charLength.',
  ];
}
