/**
 * LSP Call Hierarchy tool - traces function call relationships
 * Uses Language Server Protocol for semantic call hierarchy discovery
 * Falls back to pattern matching when LSP is unavailable
 */

import { readFile } from 'fs/promises';
import { getHints } from '../../hints/index.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { SymbolResolver, SymbolResolutionError } from '../../lsp/resolver.js';
import {
  isLanguageServerAvailable,
  LSP_UNAVAILABLE_HINT,
} from '../../lsp/manager.js';
import type { CallHierarchyResult } from '../../lsp/types.js';
import type { LSPCallHierarchyQuery } from '@octocodeai/octocode-core';
import { ToolErrors } from '../../errors/errorFactories.js';
import { callHierarchyWithLSP } from './callHierarchyLsp.js';
import { callHierarchyWithPatternMatching } from './callHierarchyPatterns.js';
import { applyOutputSizeLimit } from '../../utils/pagination/outputSizeLimit.js';
import { serializeForPagination } from '../../utils/pagination/core.js';
import { TOOL_NAME } from './constants.js';
import { resolveWorkspaceRootForFile } from '../../lsp/workspaceRoot.js';
import { applyQueryOutputPagination } from '../../utils/response/structuredPagination.js';

/**
 * Process a single call hierarchy query
 */
export async function processCallHierarchy(
  query: LSPCallHierarchyQuery
): Promise<CallHierarchyResult> {
  try {
    const pathValidation = validateToolPath(
      { path: query.uri, ...query },
      TOOL_NAME
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as CallHierarchyResult;
    }

    const absolutePath = pathValidation.sanitizedPath!;

    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      const toolError = ToolErrors.fileAccessFailed(
        query.uri,
        error instanceof Error ? error : undefined
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAME,
        extra: { resolvedPath: absolutePath },
      }) as CallHierarchyResult;
    }

    const resolver = new SymbolResolver({ lineSearchRadius: 5 });
    let resolvedSymbol;
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
          errorType: 'symbol_not_found',
          error: error.message,
          hints: [
            ...getHints(TOOL_NAME, 'empty'),
            `Symbol '${query.symbolName}' not found at line ${query.lineHint}`,
            'Verify the exact function name (case-sensitive)',
            'Check the line number is correct',
            'Use localSearchCode to find the function first',
          ],
        };
      }
      throw error;
    }

    const workspaceRoot = await resolveWorkspaceRootForFile(absolutePath);
    const lspAvailable = await isLanguageServerAvailable(
      absolutePath,
      workspaceRoot
    );

    if (lspAvailable) {
      try {
        const result = await callHierarchyWithLSP(
          absolutePath,
          workspaceRoot,
          resolvedSymbol.position,
          query,
          content
        );
        if (result) return applyCallHierarchyOutputLimit(result, query);
      } catch {
        // LSP call hierarchy failed; pattern-matching fallback still produces a result.
      }
    }

    const patternResult = await callHierarchyWithPatternMatching(
      query,
      absolutePath,
      workspaceRoot,
      content,
      resolvedSymbol.foundAtLine,
      resolver
    );
    return applyCallHierarchyOutputLimit(
      withLspUnavailableHint(patternResult, lspAvailable),
      query
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
    }) as CallHierarchyResult;
  }
}

/**
 * Prepend the shared LSP-unavailable hint when the result came from the
 * pattern-matching fallback rather than a real language server. Without
 * this, agents mistake partial text-based matches for semantic call graphs.
 */
function withLspUnavailableHint(
  result: CallHierarchyResult,
  lspAvailable: boolean
): CallHierarchyResult {
  if (lspAvailable) return result;
  return {
    ...result,
    hints: [LSP_UNAVAILABLE_HINT, ...(result.hints || [])],
  };
}

/**
 * Apply output size limits to a call hierarchy result.
 * Serializes the result, checks against MAX_OUTPUT_CHARS, and auto-paginates
 * or applies explicit charOffset/charLength if provided.
 */
function applyCallHierarchyOutputLimit(
  result: CallHierarchyResult,
  query: LSPCallHierarchyQuery
): CallHierarchyResult {
  if (result.status !== 'hasResults') return result;

  const serialized = serializeForPagination(result, true);
  const sizeLimitResult = applyOutputSizeLimit(serialized, {
    charOffset: query.charOffset,
    charLength: query.charLength,
  });

  if (!sizeLimitResult.wasLimited || !sizeLimitResult.pagination) return result;

  const pagedQueryResult = applyQueryOutputPagination(
    {
      id: query.id ?? 'q1',
      status: result.status,
      data: result as unknown as Record<string, unknown>,
    },
    {
      charOffset: sizeLimitResult.pagination.charOffset,
      charLength: sizeLimitResult.pagination.charLength,
    },
    TOOL_NAME
  );

  const pagedData =
    pagedQueryResult.data as unknown as Partial<CallHierarchyResult>;

  // Re-spread the original result.hints to make hint-preservation an explicit
  // invariant. applyQueryOutputPagination today excludes 'hints' from
  // structured pagination, so result.hints survives in pagedData.hints — but
  // re-spreading guards against future paginator changes that might paginate
  // hints, and aligns with applyGotoDefinitionOutputLimit's pattern. Set
  // dedupes the outer hints with whatever pagedData.hints carries through.
  const combinedHints = [
    ...(result.hints ?? []),
    ...((pagedData.hints as string[] | undefined) ?? []),
    ...sizeLimitResult.warnings,
    ...sizeLimitResult.paginationHints,
  ];

  return {
    ...result,
    ...pagedData,
    outputPagination: {
      charOffset: sizeLimitResult.pagination.charOffset!,
      charLength: sizeLimitResult.pagination.charLength!,
      totalChars: sizeLimitResult.pagination.totalChars!,
      hasMore: sizeLimitResult.pagination.hasMore,
      currentPage: sizeLimitResult.pagination.currentPage,
      totalPages: sizeLimitResult.pagination.totalPages,
    },
    hints: Array.from(new Set(combinedHints)),
  };
}

export {
  parseRipgrepJsonOutput,
  parseGrepOutput,
  extractFunctionBody,
} from './callHierarchyPatterns.js';
export {
  isFunctionAssignment,
  inferSymbolKind,
  createRange,
  escapeRegex,
} from './callHierarchyHelpers.js';
