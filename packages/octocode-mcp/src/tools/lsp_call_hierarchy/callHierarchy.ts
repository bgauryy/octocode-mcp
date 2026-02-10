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

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Process a single call hierarchy query
 */
export async function processCallHierarchy(
  query: LSPCallHierarchyQuery
): Promise<CallHierarchyResult> {
  try {
    // Validate the file path
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
    const resolver = new SymbolResolver({ lineSearchRadius: 2 });
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
        if (result) return result;
      } catch {
        // Fall back to pattern matching if LSP fails
      }
    }

    // Fallback: Use pattern matching approach
    return await callHierarchyWithPatternMatching(
      query,
      absolutePath,
      content,
      resolvedSymbol.foundAtLine,
      resolver
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
      extra: { uri: query.uri },
    }) as CallHierarchyResult;
  }
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
