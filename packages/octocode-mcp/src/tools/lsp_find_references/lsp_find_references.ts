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
import type { FindReferencesResult, ExactPosition } from '../../lsp/types.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { ToolErrors } from '../../errorCodes.js';
import { executeFindReferences } from './execution.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { findReferencesWithLSP } from './lspReferencesCore.js';
import {
  findReferencesWithPatternMatching,
  findWorkspaceRoot,
} from './lspReferencesPatterns.js';

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
    // Validate the file path
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
    const resolver = new SymbolResolver({ lineSearchRadius: 2 });
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

    // Get workspace root
    const workspaceRoot =
      process.env.WORKSPACE_ROOT || findWorkspaceRoot(absolutePath);

    // Try to use LSP for semantic reference finding
    if (await isLanguageServerAvailable(absolutePath)) {
      try {
        const result = await findReferencesWithLSP(
          absolutePath,
          workspaceRoot,
          resolvedSymbol.position,
          query
        );
        if (result) return result;
      } catch {
        // Fall back to pattern matching if LSP fails
      }
    }

    // Fallback: Find references using pattern matching (ripgrep/grep)
    return await findReferencesWithPatternMatching(
      absolutePath,
      workspaceRoot,
      query
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
      extra: { uri: query.uri, symbolName: query.symbolName },
    }) as FindReferencesResult;
  }
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
