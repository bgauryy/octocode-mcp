/**
 * LSP Find References Tool
 *
 * Finds all references to a symbol across the workspace using Language Server Protocol.
 * Falls back to pattern matching when LSP is not available.
 *
 * @module tools/lsp_find_references
 */

import { readFile, stat } from 'fs/promises';

import { type LSPFindReferencesQuery } from './scheme.js';
import { SymbolResolver, SymbolResolutionError } from '../../lsp/resolver.js';
import { isLanguageServerAvailable } from '../../lsp/manager.js';
import type {
  FindReferencesResult,
  ExactPosition,
  ReferenceLocation,
} from '../../lsp/types.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { ToolErrors } from '../../errors/errorFactories.js';
import { resolveWorkspaceRoot } from '@octocode/security/workspaceRoot';
import { TOOL_NAME } from './constants.js';
import { findReferencesWithLSP } from './lspReferencesCore.js';
import { findReferencesWithPatternMatching } from './lspReferencesPatterns.js';

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

    try {
      await stat(absolutePath);
    } catch (error) {
      const toolError = ToolErrors.fileAccessFailed(
        query.uri,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAME,
        extra: { resolvedPath: absolutePath },
      }) as FindReferencesResult;
    }

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
        extra: { resolvedPath: absolutePath },
      }) as FindReferencesResult;
    }

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

    const workspaceRoot = resolveWorkspaceRoot();

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
        // LSP find-references failed; pattern matching still returns full text coverage.
      }
    }

    const patternResult = await findReferencesWithPatternMatching(
      absolutePath,
      workspaceRoot,
      query
    );

    return mergeReferenceResults(lspResult, patternResult, query);
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
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
  if (
    !lspResult ||
    lspResult.status === 'empty' ||
    !lspResult.locations?.length
  ) {
    return patternResult;
  }

  if (patternResult.status === 'empty' || !patternResult.locations?.length) {
    return lspResult;
  }

  const seen = new Set(
    lspResult.locations.map(
      (loc: ReferenceLocation) => `${loc.uri}:${loc.range.start.line}`
    )
  );

  const additionalRefs = patternResult.locations.filter(
    (loc: ReferenceLocation) => !seen.has(`${loc.uri}:${loc.range.start.line}`)
  );

  if (additionalRefs.length === 0) {
    return {
      ...lspResult,
      hints: [
        ...(lspResult.hints || []),
        'All references confirmed by both LSP and text search',
      ],
    };
  }

  const mergedLocations = [...lspResult.locations, ...additionalRefs];
  const totalReferences = mergedLocations.length;
  const uniqueFiles = new Set(
    mergedLocations.map((ref: ReferenceLocation) => ref.uri)
  );

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
    hasMultipleFiles: uniqueFiles.size > 1,
    hints,
  };
}

export { findReferencesWithLSP } from './lspReferencesCore.js';
export { findReferencesWithPatternMatching } from './lspReferencesPatterns.js';
