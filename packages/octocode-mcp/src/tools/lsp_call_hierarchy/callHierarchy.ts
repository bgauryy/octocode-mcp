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
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import {
  SymbolResolver,
  SymbolResolutionError,
  isLanguageServerAvailable,
} from '../../lsp/index.js';
import type { CallHierarchyResult } from '../../lsp/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import { ToolErrors } from '../../errorCodes.js';
import { callHierarchyWithLSP } from './callHierarchyLsp.js';
import { callHierarchyWithPatternMatching } from './callHierarchyPatterns.js';
import {
  applyOutputSizeLimit,
  serializeForPagination,
} from '../../utils/pagination/index.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

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

    // Read file content
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
        extra: { path: query.uri },
      }) as CallHierarchyResult;
    }

    // Resolve the symbol position using the resolver
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
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
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

    // Try LSP first for semantic call hierarchy
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

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
        // LSP failed — fall back to pattern matching silently
      }
    }

    // Fallback: Use pattern matching approach
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
      extra: { uri: query.uri },
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
  // Only apply to results with data (not empty/error)
  if (result.status !== 'hasResults') return result;

  const serialized = serializeForPagination(result, true);
  const sizeLimitResult = applyOutputSizeLimit(serialized, {
    charOffset: query.charOffset,
    charLength: query.charLength,
  });

  if (!sizeLimitResult.wasLimited || !sizeLimitResult.pagination) return result;

  const { pagination } = sizeLimitResult;

  // Add outputPagination metadata and warnings to the result
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

  // Append pagination hints to existing hints (hints is always set by LSP/pattern matching)
  limitedResult.hints = [
    ...(result.hints as string[]),
    ...sizeLimitResult.warnings,
    ...sizeLimitResult.paginationHints,
  ];

  return limitedResult;
}

// Re-export testing utilities from helper modules
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
