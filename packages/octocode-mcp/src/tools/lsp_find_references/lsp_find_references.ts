/**
 * LSP Find References Tool
 *
 * Finds all references to a symbol across the workspace using Language Server Protocol.
 * Falls back to pattern matching when LSP is not available.
 *
 * @module tools/lsp_find_references
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { readFile, stat } from 'fs/promises';

import {
  BulkLSPFindReferencesSchema,
  LSP_FIND_REFERENCES_DESCRIPTION,
  type LSPFindReferencesQuery,
} from './scheme.js';
import {
  SymbolResolver,
  SymbolResolutionError,
  isLanguageServerAvailable,
} from '../../lsp/index.js';
import type {
  FindReferencesResult,
  ExactPosition,
  ReferenceLocation,
} from '../../lsp/types.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { ToolErrors } from '../../errorCodes.js';
import { executeFindReferences } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { findReferencesWithLSP } from './lspReferencesCore.js';
import { findReferencesWithPatternMatching } from './lspReferencesPatterns.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

/**
 * Register the LSP find references tool with the MCP server.
 */
export function registerLSPFindReferencesTool(server: McpServer) {
  return server.registerTool(
    'lspFindReferences',
    {
      description: LSP_FIND_REFERENCES_DESCRIPTION,
      inputSchema: BulkLSPFindReferencesSchema as unknown as AnySchema,
      annotations: {
        title: 'Find References',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(executeFindReferences)
  );
}

/**
 * Find all references to a symbol
 */
export async function findReferences(
  query: LSPFindReferencesQuery
): Promise<FindReferencesResult> {
  try {
    const pathValidation = validateToolPath(
      { ...query, path: query.uri },
      TOOL_NAME
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as FindReferencesResult;
    }

    const absolutePath = pathValidation.sanitizedPath!;

    // Check file exists
    try {
      await stat(absolutePath);
    } catch (error) {
      const toolError = ToolErrors.fileAccessFailed(
        query.uri,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAME,
        extra: { uri: query.uri, resolvedPath: absolutePath },
      }) as FindReferencesResult;
    }

    // Read file content
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      const toolError = ToolErrors.fileReadFailed(
        query.uri,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAME,
        extra: { uri: query.uri },
      }) as FindReferencesResult;
    }

    // Resolve the symbol position
    const resolver = new SymbolResolver({ lineSearchRadius: 5 });
    let resolvedSymbol: { position: ExactPosition; foundAtLine: number };
    try {
      resolvedSymbol = resolver.resolvePositionFromContent(content, {
        symbolName: query.symbolName,
        lineHint: query.lineHint,
        orderHint: query.orderHint ?? 0,
      });
    } catch (error) {
      if (error instanceof SymbolResolutionError) {
        return {
          status: 'empty',
          error: error.message,
          errorType: 'symbol_not_found',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            `Symbol '${query.symbolName}' not found at or near line ${query.lineHint}`,
            `Searched +/-${error.searchRadius} lines from line ${query.lineHint}`,
            'Verify the exact symbol name (case-sensitive, no partial matches)',
            'Use localGetFileContent to check the file content around that line',
            'TIP: Use localSearchCode to find the correct line number first',
          ],
        };
      }
      throw error;
    }

    // Get workspace root - use process.cwd() like callHierarchy and gotoDefinition
    // to ensure full monorepo scope (findWorkspaceRoot stops at first package.json)
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

    // Try LSP for semantic reference finding, then merge with pattern matching
    let lspResult: FindReferencesResult | null = null;
    if (await isLanguageServerAvailable(absolutePath)) {
      try {
        lspResult = await findReferencesWithLSP(
          absolutePath,
          workspaceRoot,
          resolvedSymbol.position,
          query
        );
      } catch {
        // LSP failed — fall through to pattern matching silently
      }
    }

    // Always run pattern matching for comprehensive coverage
    const patternResult = await findReferencesWithPatternMatching(
      absolutePath,
      workspaceRoot,
      query
    );

    // Merge LSP + pattern results for best coverage
    return mergeReferenceResults(lspResult, patternResult, query);
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
      extra: { uri: query.uri, symbolName: query.symbolName },
    }) as FindReferencesResult;
  }
}

/**
 * Merge LSP and pattern-matching results for comprehensive coverage.
 *
 * LSP provides semantic accuracy but may miss cross-file references on cold start.
 * Pattern matching (ripgrep) provides comprehensive text-based coverage.
 * Merging both gives the best of both worlds without persistent caching.
 *
 * Deduplication is by (uri, startLine) to avoid showing the same reference twice.
 */
export function mergeReferenceResults(
  lspResult: FindReferencesResult | null,
  patternResult: FindReferencesResult,
  query: LSPFindReferencesQuery
): FindReferencesResult {
  // If LSP returned nothing useful, use pattern results directly
  if (
    !lspResult ||
    lspResult.status === 'empty' ||
    !lspResult.locations?.length
  ) {
    return patternResult;
  }

  // If pattern returned nothing, use LSP results directly
  if (patternResult.status === 'empty' || !patternResult.locations?.length) {
    return lspResult;
  }

  // Build dedup set from LSP results (uri:startLine)
  const seen = new Set(
    lspResult.locations.map(
      (loc: ReferenceLocation) => `${loc.uri}:${loc.range.start.line}`
    )
  );

  // Find pattern-only references that LSP missed
  const additionalRefs = patternResult.locations.filter(
    (loc: ReferenceLocation) => !seen.has(`${loc.uri}:${loc.range.start.line}`)
  );

  if (additionalRefs.length === 0) {
    // LSP found everything — return LSP result as-is (higher fidelity)
    return {
      ...lspResult,
      hints: [
        ...(lspResult.hints || []),
        'All references confirmed by both LSP and text search',
      ],
    };
  }

  // Merge: LSP results + pattern-only additions
  const mergedLocations = [...lspResult.locations, ...additionalRefs];
  const totalReferences = mergedLocations.length;
  const uniqueFiles = new Set(
    mergedLocations.map((ref: ReferenceLocation) => ref.uri)
  );

  // Re-paginate the merged results
  const referencesPerPage = query.referencesPerPage ?? 20;
  const page = query.page ?? 1;
  const totalPages = Math.ceil(totalReferences / referencesPerPage);
  const startIndex = (page - 1) * referencesPerPage;
  const endIndex = Math.min(startIndex + referencesPerPage, totalReferences);
  const paginatedLocations = mergedLocations.slice(startIndex, endIndex);

  const hints = [
    ...(lspResult.hints || []),
    `Added ${additionalRefs.length} reference(s) from text search that LSP missed`,
  ];

  if (page < totalPages) {
    hints.push(
      `Showing page ${page} of ${totalPages}. Use page=${page + 1} for more.`
    );
  }

  return {
    status: 'hasResults',
    locations: paginatedLocations,
    pagination: {
      currentPage: page,
      totalPages,
      totalResults: totalReferences,
      hasMore: page < totalPages,
      resultsPerPage: referencesPerPage,
    },
    totalReferences,
    hasMultipleFiles: uniqueFiles.size > 1,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints,
  };
}

// Re-export functions from focused modules
export {
  findReferencesWithLSP,
  matchesFilePatterns,
} from './lspReferencesCore.js';
export {
  findReferencesWithPatternMatching,
  findWorkspaceRoot,
  isLikelyDefinition,
  buildRipgrepGlobArgs,
  buildGrepFilterArgs,
} from './lspReferencesPatterns.js';
