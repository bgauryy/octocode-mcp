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
import { resolveWorkspaceRoot } from '../../security/workspaceRoot.js';
import { SymbolResolver, SymbolResolutionError } from '../../lsp/resolver.js';
import { isLanguageServerAvailable } from '../../lsp/manager.js';
import type { CallHierarchyResult } from '../../lsp/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import { ToolErrors } from '../../errors/errorFactories.js';
import { callHierarchyWithLSP } from './callHierarchyLsp.js';
import { callHierarchyWithPatternMatching } from './callHierarchyPatterns.js';
import { applyOutputSizeLimit } from '../../utils/pagination/outputSizeLimit.js';
import { serializeForPagination } from '../../utils/pagination/core.js';
import { TOOL_NAME } from './constants.js';

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

    const workspaceRoot = resolveWorkspaceRoot();

    if (await isLanguageServerAvailable(absolutePath)) {
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
      content,
      resolvedSymbol.foundAtLine,
      resolver
    );
    return applyCallHierarchyOutputLimit(patternResult, query);
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
    }) as CallHierarchyResult;
  }
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

  const { pagination } = sizeLimitResult;

  const limitedResult: CallHierarchyResult = {
    ...result,
    outputPagination: {
      charOffset: pagination.charOffset!,
      charLength: pagination.charLength!,
      totalChars: pagination.totalChars!,
      hasMore: pagination.hasMore,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
    },
  };

  limitedResult.hints = [
    ...(result.hints as string[]),
    ...sizeLimitResult.warnings,
    ...sizeLimitResult.paginationHints,
  ];

  return limitedResult;
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
