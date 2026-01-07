/**
 * Dynamic, context-aware hints for tools
 * Provides intelligent hints based on runtime context
 * @module hints/dynamic
 */

import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { getMetadataDynamicHints } from './static.js';
import type { HintContext, HintStatus, ToolHintGenerators } from './types.js';

/**
 * Smart, reasoning-based hints for each tool
 * Keys are actual tool names from STATIC_TOOL_NAMES
 */
export const HINTS: Record<string, ToolHintGenerators> = {
  [STATIC_TOOL_NAMES.LOCAL_RIPGREP]: {
    hasResults: (ctx: HintContext = {}) => [
      ctx.searchEngine === 'grep'
        ? 'Using grep fallback - install ripgrep for best performance and features.'
        : undefined,
      'Next: localGetFileContent for context (prefer matchString).',
      'Also search imports/usages/defs with localSearchCode.',
      ctx.fileCount && ctx.fileCount > 5
        ? 'Tip: run queries in parallel.'
        : undefined,
    ],

    empty: (ctx: HintContext = {}) => [
      ctx.searchEngine === 'grep'
        ? 'Using grep fallback - note: grep does not respect .gitignore.'
        : undefined,
      'No matches. Broaden scope (noIgnore, hidden) or use fixedString.',
      'Unsure of paths? localViewStructure or localFindFiles.',
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        const baseHints = [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          'Add type/path filters to focus.',
          ctx.path?.includes('node_modules')
            ? 'In node_modules, target specific packages.'
            : undefined,
          'Names only? Use localFindFiles.',
          'Flow: filesOnly=true \u2192 refine \u2192 read.',
        ];
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'largeResult'
          ),
        ];
      }
      return ['Tool unavailable; try localFindFiles or localViewStructure.'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT]: {
    hasResults: (_ctx: HintContext = {}) => [
      'Next: trace imports/usages with localSearchCode.',
      'Open related files (tests/types/impl) together.',
      'Prefer matchString over full file.',
    ],

    empty: (_ctx: HintContext = {}) => [
      'No match/file. Check path/pattern.',
      'Locate via localFindFiles (name) or localSearchCode (filesOnly for paths).',
    ],

    error: (ctx: HintContext = {}) => {
      if (
        ctx.errorType === 'size_limit' &&
        ctx.isLarge &&
        !ctx.hasPagination &&
        !ctx.hasPattern
      ) {
        const baseHints = [
          ctx.fileSize
            ? `Large file (~${Math.round(ctx.fileSize * 0.25)}K tokens).`
            : 'Large file.',
          'Use matchString for sections, or charLength to paginate.',
          'Avoid fullContent without pagination.',
        ];
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
            'largeFile'
          ),
        ];
      }

      if (ctx.errorType === 'pattern_too_broad') {
        const baseHints = [
          ctx.tokenEstimate
            ? `Pattern too broad (~${ctx.tokenEstimate.toLocaleString()} tokens).`
            : 'Pattern too broad.',
          'Tighten pattern or paginate with charLength.',
        ];
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
            'patternTooBroad'
          ),
        ];
      }

      return ['Unknown path; find via localFindFiles or localSearchCode.'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE]: {
    hasResults: (ctx: HintContext = {}) => [
      'Next: localSearchCode for patterns; localFindFiles for filters.',
      'Drill deeper with depth=2 when needed.',
      ctx.entryCount && ctx.entryCount > 10
        ? 'Parallelize across directories.'
        : undefined,
    ],

    empty: (_ctx: HintContext = {}) => [
      'Empty/missing. Use hidden=true or check parent.',
      'Discover dirs with localFindFiles type="d".',
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit' && ctx.entryCount) {
        const baseHints = [
          `Directory has ${ctx.entryCount} entries${ctx.tokenEstimate ? ` (~${ctx.tokenEstimate.toLocaleString()} tokens)` : ''}. Use entriesPerPage.`,
          'Sort by recent; scan page by page.',
        ];
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
            'largeDirectory'
          ),
        ];
      }
      return ['Access failed; locate dirs with localFindFiles type="d".'];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FIND_FILES]: {
    hasResults: (ctx: HintContext = {}) => {
      const baseHints = [
        'Found files. Next: localGetFileContent or localSearchCode.',
        'Use modifiedWithin="7d" to track recent changes.',
        ctx.fileCount && ctx.fileCount > 3 ? 'Batch in parallel.' : undefined,
      ];
      if (ctx.fileCount && ctx.fileCount > 20) {
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
            'manyResults'
          ),
        ];
      }
      return baseHints;
    },

    empty: (_ctx: HintContext = {}) => [
      'No matches. Broaden iname, increase maxDepth, relax filters.',
      'Or use localViewStructure/localSearchCode.',
      'Syntax: time "7d", size "10M".',
    ],

    error: (_ctx: HintContext = {}) => [
      'Search failed; try localViewStructure or localSearchCode.',
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

  [STATIC_TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    hasResults: (_ctx: HintContext = {}) => [
      // Context-aware hints - static hints cover generic cases
      // Metadata dynamic hints (topicsHasResults, etc.) are loaded separately via extraHints
    ],
    empty: (_ctx: HintContext = {}) => [
      // Static hints cover "Try broader terms", metadata dynamic hints cover topics/keywords
    ],
    error: (_ctx: HintContext = {}) => [],
  },

  [STATIC_TOOL_NAMES.PACKAGE_SEARCH]: {
    hasResults: (_ctx: HintContext = {}) => [
      // Package-specific hints are generated in the tool itself (deprecation, install, explore)
    ],
    empty: (_ctx: HintContext = {}) => [
      // Package-specific empty hints are generated in the tool itself
    ],
    error: (_ctx: HintContext = {}) => [],
  },

  // LSP Tools
  [STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION]: {
    hasResults: (ctx: HintContext = {}) => [
      'Definition found. Next: lspFindReferences for all usages.',
      'Chain: lspGotoDefinition on imports to trace to source.',
      (ctx as Record<string, unknown>).locationCount &&
      ((ctx as Record<string, unknown>).locationCount as number) > 1
        ? `Multiple definitions (${(ctx as Record<string, unknown>).locationCount}) - check overloads or re-exports.`
        : undefined,
      'Read more context: localGetFileContent with wider range.',
      (ctx as Record<string, unknown>).hasExternalPackage
        ? 'External package? Use packageSearch → githubGetFileContent for source.'
        : undefined,
    ],
    empty: (ctx: HintContext = {}) => [
      'No definition found. Verify symbolName is EXACT (case-sensitive).',
      (ctx as Record<string, unknown>).searchRadius
        ? `Searched ±${(ctx as Record<string, unknown>).searchRadius} lines from lineHint=${(ctx as Record<string, unknown>).lineHint}. Adjust hint.`
        : 'Check lineHint is 1-indexed and accurate.',
      'Locate symbol first: localSearchCode(pattern="symbolName") → get line number.',
      'Dynamic/computed symbol? LSP cannot resolve runtime values.',
      'Try localSearchCode for text-based fallback.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          `Symbol "${(ctx as Record<string, unknown>).symbolName}" not found at line ${(ctx as Record<string, unknown>).lineHint}.`,
          'Use localSearchCode to find correct location, then retry.',
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'file_not_found') {
        return [
          'File not found. Verify uri path exists.',
          'Use localFindFiles or localViewStructure to locate file.',
        ];
      }
      return ['LSP error. Try localSearchCode as fallback.'];
    },
  },

  [STATIC_TOOL_NAMES.LSP_FIND_REFERENCES]: {
    hasResults: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).locationCount &&
      ((ctx as Record<string, unknown>).locationCount as number) > 20
        ? `Found ${(ctx as Record<string, unknown>).locationCount} references. Use referencesPerPage + page to paginate.`
        : `Found ${(ctx as Record<string, unknown>).locationCount || 'multiple'} references.`,
      'Next: localGetFileContent to read each reference location.',
      'For call-only references: use lspCallHierarchy instead.',
      (ctx as Record<string, unknown>).hasMultipleFiles
        ? 'References span multiple files - consider impact analysis.'
        : undefined,
      (ctx as Record<string, unknown>).hasMorePages
        ? `Page ${(ctx as Record<string, unknown>).currentPage}/${(ctx as Record<string, unknown>).totalPages}. Use page=${(((ctx as Record<string, unknown>).currentPage as number) || 1) + 1} for next.`
        : undefined,
    ],
    empty: (_ctx: HintContext = {}) => [
      'No references found. Symbol may be unused or dynamically referenced.',
      'Verify symbolName matches exactly (case-sensitive).',
      'Check if symbol is exported - internal symbols have limited scope.',
      'Fallback: localSearchCode for text-based search.',
      'Dead code? Consider removing unused symbol.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          'Could not resolve symbol. Use lspGotoDefinition first to verify location.',
        ];
      }
      return ['LSP error. Try localSearchCode as fallback.'];
    },
  },

  [STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY]: {
    hasResults: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).direction === 'incoming'
        ? `Found ${(ctx as Record<string, unknown>).callCount || 'multiple'} callers. These functions call your target.`
        : `Found ${(ctx as Record<string, unknown>).callCount || 'multiple'} callees. Your target calls these functions.`,
      'Read implementations: localGetFileContent for each call site.',
      (ctx as Record<string, unknown>).depth === 1
        ? 'Increase depth=2 for transitive calls (A→B→C).'
        : `Depth=${(ctx as Record<string, unknown>).depth} showing ${(ctx as Record<string, unknown>).depth}-level call chain.`,
      'Switch direction: incoming↔outgoing for full picture.',
      (ctx as Record<string, unknown>).hasMorePages
        ? `Page ${(ctx as Record<string, unknown>).currentPage}/${(ctx as Record<string, unknown>).totalPages}. More calls available.`
        : undefined,
      'Chain: lspCallHierarchy on each caller to trace full path.',
    ],
    empty: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).direction === 'incoming'
        ? 'No callers found. Function may be entry point, unused, or called dynamically.'
        : 'No callees found. Function may be leaf node or uses only built-ins.',
      'Verify symbolName is a function/method, not a variable or type.',
      'Check direction: "incoming" (callers) vs "outgoing" (callees).',
      'Fallback: lspFindReferences for broader usage search.',
      'Dynamic calls (callbacks, eval)? LSP cannot trace runtime dispatch.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'not_a_function') {
        return [
          'Call hierarchy requires a function/method symbol.',
          'For types/variables, use lspFindReferences instead.',
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          `Depth=${(ctx as Record<string, unknown>).depth} caused timeout. Reduce to depth=1.`,
          'Large codebases: paginate with callsPerPage.',
        ];
      }
      return ['LSP error. Try lspFindReferences as fallback.'];
    },
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
      'Flow: localSearchCode filesOnly \u2192 add type/path filters \u2192 localGetFileContent matchString \u2192 localSearchCode links.',
      'Parallelize where safe.',
    ];
  }
  return [
    "Large file: don't read all.",
    'Flow: localGetFileContent matchString \u2192 analyze \u2192 localSearchCode usages/imports \u2192 localGetFileContent related.',
    'Use charLength to paginate if needed.',
    'Avoid fullContent without charLength.',
  ];
}
