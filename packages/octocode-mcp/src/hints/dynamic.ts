/**
 * Dynamic, context-aware hints for tools
 * Provides intelligent hints based on runtime context
 * @module hints/dynamic
 */

import { STATIC_TOOL_NAMES } from '../tools/toolNames.js';
import { getMetadataDynamicHints } from './static.js';
import type { HintContext, HintStatus, ToolHintGenerators } from './types.js';

/**
 * Smart, reasoning-based hints for each tool
 * Keys are actual tool names from STATIC_TOOL_NAMES
 */
export const HINTS: Record<string, ToolHintGenerators> = {
  [STATIC_TOOL_NAMES.LOCAL_RIPGREP]: {
    // Only context-aware hints - base hints come from HOST static hints
    hasResults: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      if (ctx.searchEngine === 'grep') {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'grepFallback'
          )
        );
      }
      if (ctx.fileCount && ctx.fileCount > 5) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'parallelTip'
          )
        );
      }
      if (ctx.fileCount && ctx.fileCount > 1) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'multipleFiles'
          )
        );
      }
      return hints;
    },

    empty: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      if (ctx.searchEngine === 'grep') {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'grepFallbackEmpty'
          )
        );
      }
      return hints;
    },

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          `Too many results${ctx.matchCount ? ` (${ctx.matchCount} matches)` : ''}. Narrow pattern/scope.`,
          ...(ctx.path?.includes('node_modules')
            ? getMetadataDynamicHints(
                STATIC_TOOL_NAMES.LOCAL_RIPGREP,
                'nodeModulesSearch'
              )
            : []),
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_RIPGREP,
            'largeResult'
          ),
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT]: {
    // Only context-aware hints - base hints come from HOST static hints
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
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
            'largeFile'
          ),
        ];
      }

      if (ctx.errorType === 'pattern_too_broad') {
        return [
          ctx.tokenEstimate
            ? `Pattern too broad (~${ctx.tokenEstimate.toLocaleString()} tokens).`
            : undefined,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
            'patternTooBroad'
          ),
        ];
      }

      return [];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE]: {
    // Only context-aware hints - base hints come from HOST static hints
    hasResults: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      if (ctx.entryCount && ctx.entryCount > 10) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
            'parallelize'
          )
        );
      }
      return hints;
    },

    empty: (_ctx: HintContext = {}) => [
      // Base hints come from HOST
    ],

    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit' && ctx.entryCount) {
        return [
          `Directory has ${ctx.entryCount} entries${ctx.tokenEstimate ? ` (~${ctx.tokenEstimate.toLocaleString()} tokens)` : ''}.`,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
            'largeDirectory'
          ),
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.LOCAL_FIND_FILES]: {
    // Only context-aware hints - base hints come from HOST static hints
    hasResults: (ctx: HintContext = {}) => {
      const hints: (string | undefined)[] = [];
      // Add batchParallel hints for multiple results
      if (ctx.fileCount && ctx.fileCount > 3) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
            'batchParallel'
          )
        );
      }
      // Add manyResults hints for large result sets
      if (ctx.fileCount && ctx.fileCount > 20) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
            'manyResults'
          )
        );
      }
      // Add configFiles hints when config files are found
      if ((ctx as Record<string, unknown>).hasConfigFiles) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
            'configFiles'
          )
        );
      }
      return hints;
    },

    empty: (_ctx: HintContext = {}) => [
      // Base hints come from HOST
    ],

    error: (_ctx: HintContext = {}) => [],
  },

  [STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    hasResults: (ctx: HintContext = {}) => {
      // Context-aware hints based on single vs multi-repo results
      const hints: (string | undefined)[] = [];
      if (ctx.hasOwnerRepo) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
            'singleRepo'
          )
        );
      } else {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
            'multiRepo'
          )
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
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
            'pathEmpty'
          )
        );
      } else if (!ctx.hasOwnerRepo) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
            'crossRepoEmpty'
          )
        );
      }
      // Note: "Try semantic variants" is in static hints, not duplicated here
      return hints;
    },
    error: (_ctx: HintContext = {}) => [],
  },

  [STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    hasResults: (ctx: HintContext = {}) => {
      // Only add context-aware hints, static hints come from content.json
      const hints: (string | undefined)[] = [];
      if (ctx.isLarge) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
            'largeFile'
          )
        );
      }
      return hints;
    },
    empty: (_ctx: HintContext = {}) => [
      // Static hints cover the common cases, no dynamic hints needed
    ],
    error: (ctx: HintContext = {}) => {
      if (ctx.errorType === 'size_limit') {
        return [
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
            'fileTooLarge'
          ),
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    hasResults: (ctx: HintContext = {}) => {
      // Only add context-aware hints based on entry count
      const hints: (string | undefined)[] = [];
      if (ctx.entryCount && ctx.entryCount > 50) {
        hints.push(`Large directory (${ctx.entryCount} entries).`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            'largeDirectory'
          )
        );
      }
      return hints;
    },
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

  // LSP Tools - Context-aware hints only (base hints come from HOST)
  [STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION]: {
    hasResults: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      const locationCount = (ctx as Record<string, unknown>).locationCount as
        | number
        | undefined;
      if (locationCount && locationCount > 1) {
        hints.push(`Found ${locationCount} definitions.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'multipleDefinitions'
          )
        );
      }
      if ((ctx as Record<string, unknown>).hasExternalPackage) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'externalPackage'
          )
        );
      }
      if ((ctx as Record<string, unknown>).isFallback) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'fallbackMode'
          )
        );
      }
      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      const searchRadius = (ctx as Record<string, unknown>).searchRadius;
      const lineHint = (ctx as Record<string, unknown>).lineHint;
      if (searchRadius) {
        hints.push(
          `Searched ±${searchRadius} lines from lineHint=${lineHint}. Adjust hint.`
        );
      }
      if ((ctx as Record<string, unknown>).symbolName) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'symbolNotFound'
          )
        );
      }
      return hints;
    },
    error: (ctx: HintContext = {}) => {
      const symbolName = (ctx as Record<string, unknown>).symbolName;
      const lineHint = (ctx as Record<string, unknown>).lineHint;
      const uri = (ctx as Record<string, unknown>).uri as string | undefined;

      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          `Symbol "${symbolName}" not found at line ${lineHint}.`,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'symbolNotFound'
          ),
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'file_not_found') {
        return [
          `File not found: ${uri}`,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'fileNotFound'
          ),
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
            'timeout'
          ),
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.LSP_FIND_REFERENCES]: {
    hasResults: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      const locationCount = (ctx as Record<string, unknown>).locationCount as
        | number
        | undefined;
      const fileCount = (ctx as Record<string, unknown>).fileCount;
      const currentPage = (ctx as Record<string, unknown>).currentPage as
        | number
        | undefined;
      const totalPages = (ctx as Record<string, unknown>).totalPages;

      if (locationCount && locationCount > 20) {
        hints.push(`Found ${locationCount} references.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'manyReferences'
          )
        );
      }
      if ((ctx as Record<string, unknown>).hasMultipleFiles) {
        hints.push(`References span ${fileCount || 'multiple'} files.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'multipleFiles'
          )
        );
      }
      if ((ctx as Record<string, unknown>).hasMorePages) {
        hints.push(`Page ${currentPage}/${totalPages}.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'pagination'
          )
        );
      }
      if ((ctx as Record<string, unknown>).isFallback) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'fallbackMode'
          )
        );
      }
      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      if ((ctx as Record<string, unknown>).symbolName) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'symbolNotFound'
          )
        );
      }
      return hints;
    },
    error: (ctx: HintContext = {}) => {
      if ((ctx as Record<string, unknown>).errorType === 'symbol_not_found') {
        return [
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'symbolNotFound'
          ),
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
            'timeout'
          ),
        ];
      }
      return [];
    },
  },

  [STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY]: {
    hasResults: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      const direction = (ctx as Record<string, unknown>).direction;
      const callCount = (ctx as Record<string, unknown>).callCount;
      const depth = (ctx as Record<string, unknown>).depth as
        | number
        | undefined;
      const currentPage = (ctx as Record<string, unknown>).currentPage as
        | number
        | undefined;
      const totalPages = (ctx as Record<string, unknown>).totalPages;

      // Direction-based hints
      if (direction === 'incoming') {
        hints.push(`Found ${callCount || 'multiple'} callers.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'incomingResults'
          )
        );
      } else {
        hints.push(`Found ${callCount || 'multiple'} callees.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'outgoingResults'
          )
        );
      }

      // Depth hints
      if (depth && depth > 1) {
        hints.push(`Depth=${depth} showing ${depth}-level call chain.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'deepChain'
          )
        );
      }

      // Pagination hints
      if ((ctx as Record<string, unknown>).hasMorePages) {
        hints.push(`Page ${currentPage}/${totalPages}.`);
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'pagination'
          )
        );
      }

      // Fallback hints
      if ((ctx as Record<string, unknown>).isFallback) {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'fallbackMode'
          )
        );
      }

      return hints;
    },
    empty: (ctx: HintContext = {}) => {
      // Only context-aware hints - base hints come from HOST static hints
      const hints: (string | undefined)[] = [];
      const direction = (ctx as Record<string, unknown>).direction;

      if (direction === 'incoming') {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'noCallers'
          )
        );
      } else {
        hints.push(
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'noCallees'
          )
        );
      }

      return hints;
    },
    error: (ctx: HintContext = {}) => {
      const depth = (ctx as Record<string, unknown>).depth;

      if ((ctx as Record<string, unknown>).errorType === 'not_a_function') {
        return [
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'notAFunction'
          ),
        ];
      }
      if ((ctx as Record<string, unknown>).errorType === 'timeout') {
        return [
          `Depth=${depth} caused timeout.`,
          ...getMetadataDynamicHints(
            STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
            'timeout'
          ),
        ];
      }
      return [];
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
