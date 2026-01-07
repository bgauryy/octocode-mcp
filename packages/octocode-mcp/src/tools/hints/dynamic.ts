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
      'Also search imports/usages/defs with localSearchCode or use LSP tools.',
      ctx.fileCount && ctx.fileCount > 5
        ? 'Tip: run queries in parallel with bulk queries (max 5).'
        : undefined,
      ctx.fileCount && ctx.fileCount > 1
        ? 'Multiple files? Use lspFindReferences for cross-file semantic tracking.'
        : undefined,
    ],

    empty: (ctx: HintContext = {}) => [
      ctx.searchEngine === 'grep'
        ? 'Using grep fallback - note: grep does not respect .gitignore.'
        : undefined,
      'No matches. Broaden scope (noIgnore, hidden) or use fixedString.',
      'Try semantic variants (auth→login, fetch→get).',
      'Unsure of paths? localViewStructure or localFindFiles first.',
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        const baseHints = [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          'RECOVERY: Add type/path filters (e.g., type="ts", path="src/").',
          ctx.path?.includes('node_modules')
            ? 'In node_modules, target specific packages with path filter.'
            : undefined,
          'Flow: filesOnly=true → refine with filters → read with localGetFileContent.',
          'For file names only: use localFindFiles instead.',
        ];
        return [
          ...baseHints,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'largeResult'
          ),
        ];
      }
      return [
        'Tool unavailable.',
        'RECOVERY: Try localFindFiles for file names or localViewStructure for browsing.',
      ];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT]: {
    hasResults: (ctx: HintContext = {}) => [
      'Next: trace imports/usages with localSearchCode or lspFindReferences.',
      'Open related files (tests/types/impl) together.',
      'Prefer matchString over full file for large files.',
      (ctx as Record<string, unknown>).hasMoreContent
        ? 'More content available - use charOffset for pagination.'
        : undefined,
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

      if (ctx.errorType === 'not_found') {
        return [
          'File not found. Verify path exists.',
          'Use localFindFiles or localViewStructure to locate file.',
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

  // LSP Tools - Best practices from RESEARCH_FLOWS.md
  [STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION]: {
    hasResults: (ctx: HintContext = {}) => [
      'Definition found. Next: lspFindReferences for all usages.',
      'Chain: lspGotoDefinition on imports to trace to source (A→B→C).',
      (ctx as Record<string, unknown>).locationCount &&
      ((ctx as Record<string, unknown>).locationCount as number) > 1
        ? `Multiple definitions (${(ctx as Record<string, unknown>).locationCount}) - check overloads or re-exports.`
        : undefined,
      'Read more context: Use contextLines=10+ for full implementation.',
      'Trace call relationships: lspCallHierarchy(direction="incoming") for callers.',
      (ctx as Record<string, unknown>).hasExternalPackage
        ? 'External package? Use packageSearch → githubGetFileContent for source.'
        : undefined,
      (ctx as Record<string, unknown>).isFallback
        ? 'Note: Using text-based resolution (language server not available).'
        : undefined,
    ],
    empty: (ctx: HintContext = {}) => [
      'No definition found. Verify symbolName is EXACT (case-sensitive).',
      (ctx as Record<string, unknown>).searchRadius
        ? `Searched ±${(ctx as Record<string, unknown>).searchRadius} lines from lineHint=${(ctx as Record<string, unknown>).lineHint}. Adjust hint.`
        : 'lineHint is 1-indexed (line 1 = first line). NEVER use 0.',
      `RECOVERY: localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName || 'symbolName'}") → get actual line number.`,
      'orderHint: 0 = first occurrence on line, 1 = second. Adjust if needed.',
      'Dynamic/computed symbol? LSP cannot resolve runtime values - use localSearchCode.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          `Symbol "${(ctx as Record<string, unknown>).symbolName}" not found at line ${(ctx as Record<string, unknown>).lineHint}.`,
          `RECOVERY: localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName}", type="ts") → find correct line.`,
          'Then retry lspGotoDefinition with updated lineHint.',
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'file_not_found') {
        return [
          'File not found. Verify uri path exists.',
          `RECOVERY: localFindFiles(iname="${((ctx as Record<string, unknown>).uri as string)?.split('/').pop() || '*.ts'}") → locate file.`,
          'Or use localViewStructure to browse directory tree.',
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          'LSP timeout - file may be too large or complex.',
          `RECOVERY: localGetFileContent(path="${(ctx as Record<string, unknown>).uri}", matchString="${(ctx as Record<string, unknown>).symbolName}") → read directly.`,
          'Or use localSearchCode(filesOnly=true) to locate symbol first.',
        ];
      }
      return [
        'LSP error. RECOVERY: Use localSearchCode as text-based fallback.',
      ];
    },
  },

  [STATIC_TOOL_NAMES.LSP_FIND_REFERENCES]: {
    hasResults: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).locationCount &&
      ((ctx as Record<string, unknown>).locationCount as number) > 20
        ? `Found ${(ctx as Record<string, unknown>).locationCount} references. Use referencesPerPage + page to paginate.`
        : `Found ${(ctx as Record<string, unknown>).locationCount || 'multiple'} references.`,
      'Next: localGetFileContent to read each reference location for context.',
      'For function call relationships specifically: use lspCallHierarchy instead.',
      'Use includeDeclaration=false to exclude the definition itself.',
      (ctx as Record<string, unknown>).hasMultipleFiles
        ? `References span ${(ctx as Record<string, unknown>).fileCount || 'multiple'} files - impact analysis needed.`
        : undefined,
      (ctx as Record<string, unknown>).hasMorePages
        ? `Page ${(ctx as Record<string, unknown>).currentPage}/${(ctx as Record<string, unknown>).totalPages}. Use page=${(((ctx as Record<string, unknown>).currentPage as number) || 1) + 1} for next.`
        : undefined,
      (ctx as Record<string, unknown>).isFallback
        ? 'Note: Using text-based search (language server not available).'
        : 'More precise than grep: ignores comments, strings, similar names.',
    ],
    empty: (ctx: HintContext = {}) => [
      'No references found. Symbol may be unused or dynamically referenced.',
      'Verify symbolName is EXACT (case-sensitive, complete name).',
      'lineHint must be accurate (within ±2 lines of actual position).',
      `RECOVERY: localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName || 'symbolName'}") → text-based fallback.`,
      'Dead code? Consider removing unused symbol.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          'Could not resolve symbol at specified location.',
          `RECOVERY: localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName}", type="ts") → find correct line.`,
          'Then retry lspFindReferences with correct position.',
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          'LSP timeout - symbol may have too many references (100+ common).',
          'RECOVERY: Use referencesPerPage=10, page=1 to paginate results.',
          `Or use localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName}") for faster text search.`,
        ];
      }
      return [
        'LSP error.',
        `RECOVERY: localSearchCode(pattern="${(ctx as Record<string, unknown>).symbolName || 'symbolName'}") → text-based fallback.`,
      ];
    },
  },

  [STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY]: {
    hasResults: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).direction === 'incoming'
        ? `Found ${(ctx as Record<string, unknown>).callCount || 'multiple'} callers. These functions call your target.`
        : `Found ${(ctx as Record<string, unknown>).callCount || 'multiple'} callees. Your target calls these functions.`,
      'Read implementations: localGetFileContent for each call site.',
      (ctx as Record<string, unknown>).depth === 1
        ? 'Increase depth=2 for transitive calls (A→B→C). ⚠️ depth>2 is expensive (O(n^depth)).'
        : `Depth=${(ctx as Record<string, unknown>).depth} showing ${(ctx as Record<string, unknown>).depth}-level call chain.`,
      `Switch direction="${(ctx as Record<string, unknown>).direction === 'incoming' ? 'outgoing' : 'incoming'}" for full call graph.`,
      (ctx as Record<string, unknown>).hasMorePages
        ? `Page ${(ctx as Record<string, unknown>).currentPage}/${(ctx as Record<string, unknown>).totalPages}. Use page=${(((ctx as Record<string, unknown>).currentPage as number) || 1) + 1} for next.`
        : undefined,
      'Chain: lspGotoDefinition on each caller/callee to navigate.',
      'Max queries: 3 (lower than other tools due to expensive operation).',
      (ctx as Record<string, unknown>).isFallback
        ? 'Note: Using text-based analysis (language server not available).'
        : undefined,
    ],
    empty: (ctx: HintContext = {}) => [
      (ctx as Record<string, unknown>).direction === 'incoming'
        ? 'No callers found. Function may be entry point, unused, or called dynamically.'
        : 'No callees found. Function may be leaf node or uses only built-ins.',
      'Symbol MUST be a function/method, NOT a type/variable.',
      `RECOVERY: lspFindReferences(symbolName="${(ctx as Record<string, unknown>).symbolName}") → works with all symbol types.`,
      'Verify symbolName is EXACT and lineHint is accurate (±2 lines).',
      'Dynamic calls (callbacks, event handlers, eval)? LSP cannot trace runtime dispatch.',
    ],
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'not_a_function') {
        return [
          'Call hierarchy requires a function/method symbol, not type/variable.',
          `RECOVERY: lspFindReferences(symbolName="${(ctx as Record<string, unknown>).symbolName}") → works with types/variables.`,
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          `Depth=${(ctx as Record<string, unknown>).depth} caused timeout (O(n^depth) complexity).`,
          'RECOVERY: Reduce to depth=1 and use callsPerPage=10 for pagination.',
          `Or use lspFindReferences(symbolName="${(ctx as Record<string, unknown>).symbolName}") → faster but less specific.`,
        ];
      }
      return [
        'LSP error.',
        `RECOVERY: lspFindReferences(symbolName="${(ctx as Record<string, unknown>).symbolName || 'functionName'}") → fallback.`,
      ];
    },
  },
};

/**
 * Tool names that have dynamic hint generators
 */
type DynamicToolName = keyof typeof HINTS;

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
