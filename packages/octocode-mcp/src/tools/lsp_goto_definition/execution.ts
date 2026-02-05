/**
 * LSP Go To Definition execution logic
 * @module tools/lsp_goto_definition/execution
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';

import type { LSPGotoDefinitionQuery } from './scheme.js';
import {
  SymbolResolver,
  SymbolResolutionError,
  createClient,
  isLanguageServerAvailable,
} from '../../lsp/index.js';
import type {
  GotoDefinitionResult,
  CodeSnippet,
  ExactPosition,
} from '../../lsp/types.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION;

/**
 * Execute bulk goto definition operation.
 * Wraps gotoDefinition with bulk operation handling for multiple queries.
 */
export async function executeGotoDefinition(
  args: ToolExecutionArgs<LSPGotoDefinitionQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: LSPGotoDefinitionQuery) => gotoDefinition(query),
    { toolName: TOOL_NAME }
  );
}

/**
 * Execute goto definition for a single query
 */
async function gotoDefinition(
  query: LSPGotoDefinitionQuery
): Promise<GotoDefinitionResult> {
  try {
    // Validate the file path
    const pathValidation = validateToolPath(
      { ...query, path: query.uri },
      TOOL_NAME
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as GotoDefinitionResult;
    }

    const absolutePath = pathValidation.sanitizedPath!;

    // Read file content
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf-8');
    } catch (error) {
      return createErrorResult(error, query, {
        toolName: TOOL_NAME,
        extra: { uri: query.uri, resolvedPath: absolutePath },
        customHints: [
          `Could not read file: ${query.uri}`,
          'Verify the file exists and is accessible',
        ],
      }) as GotoDefinitionResult;
    }

    // Resolve fuzzy position to exact position
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
          error: error.message,
          errorType: 'symbol_not_found',
          searchRadius: error.searchRadius,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getHints(TOOL_NAME, 'empty'),
            `Symbol "${query.symbolName}" not found at or near line ${query.lineHint}`,
            `Searched lines ${Math.max(1, query.lineHint - error.searchRadius)} to ${query.lineHint + error.searchRadius}`,
            'Verify the exact symbol name (case-sensitive, no partial matches)',
            'Adjust lineHint if the symbol moved due to code changes',
          ],
        };
      }
      throw error;
    }

    // Try to use LSP for semantic definition lookup
    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

    if (await isLanguageServerAvailable(absolutePath)) {
      try {
        const result = await gotoDefinitionWithLSP(
          absolutePath,
          workspaceRoot,
          resolvedSymbol.position,
          query,
          content
        );
        if (result) return result;
      } catch {
        // Fall back to symbol resolver if LSP fails
      }
    }

    // Fallback: Return the resolved position as the "definition"
    // This is less accurate but works without a language server
    return createFallbackResult(
      query,
      absolutePath,
      content,
      resolver,
      resolvedSymbol
    );
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAME,
      extra: {
        uri: query.uri,
        symbolName: query.symbolName,
        lineHint: query.lineHint,
      },
    }) as GotoDefinitionResult;
  }
}

/**
 * Use LSP client to find definition
 */
async function gotoDefinitionWithLSP(
  filePath: string,
  workspaceRoot: string,
  position: ExactPosition,
  query: LSPGotoDefinitionQuery,
  _content: string
): Promise<GotoDefinitionResult | null> {
  const client = await createClient(workspaceRoot, filePath);
  if (!client) return null;

  try {
    const locations = await client.gotoDefinition(filePath, position);

    if (!locations || locations.length === 0) {
      return {
        status: 'empty',
        error: 'No definition found by language server',
        errorType: 'symbol_not_found',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          'Language server could not find definition',
          'Symbol may be a built-in or from external library',
          'Try packageSearch to find library source code',
        ],
      };
    }

    // Enhance snippets with context lines
    const contextLines = query.contextLines ?? 5;
    const enhancedLocations: CodeSnippet[] = [];

    for (const loc of locations) {
      try {
        const locContent = await readFile(loc.uri, 'utf-8');
        const lines = locContent.split(/\r?\n/);
        const startLine = Math.max(0, loc.range.start.line - contextLines);
        const endLine = Math.min(
          lines.length - 1,
          loc.range.end.line + contextLines
        );

        const snippetLines = lines.slice(startLine, endLine + 1);
        const numberedContent = snippetLines
          .map((line, i) => {
            const lineNum = startLine + i + 1;
            const isTarget =
              lineNum > loc.range.start.line &&
              lineNum <= loc.range.end.line + 1;
            const marker = isTarget ? '>' : ' ';
            return `${marker}${String(lineNum).padStart(4, ' ')}| ${line}`;
          })
          .join('\n');

        enhancedLocations.push({
          ...loc,
          content: numberedContent,
          displayRange: {
            startLine: startLine + 1,
            endLine: endLine + 1,
          },
        });
      } catch {
        // Keep original if we can't read the file
        enhancedLocations.push(loc);
      }
    }

    return {
      status: 'hasResults',
      locations: enhancedLocations,
      resolvedPosition: position,
      searchRadius: 2,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'hasResults'),
        `Found ${locations.length} definition(s) via Language Server`,
        locations.length > 1
          ? 'Multiple definitions - check overloads or re-exports'
          : undefined,
        'Use lspFindReferences to find all usages',
        'Use lspCallHierarchy to trace call graph',
      ].filter(Boolean) as string[],
    };
  } finally {
    await client.stop();
  }
}

/**
 * Create fallback result when LSP is not available
 */
function createFallbackResult(
  query: LSPGotoDefinitionQuery,
  absolutePath: string,
  content: string,
  resolver: SymbolResolver,
  resolvedSymbol: { position: ExactPosition; foundAtLine: number }
): GotoDefinitionResult {
  const contextLines = query.contextLines ?? 5;
  const context = resolver.extractContext(
    content,
    resolvedSymbol.foundAtLine,
    contextLines
  );

  const numberedContent = addLineNumbers(
    context.content,
    context.startLine,
    resolvedSymbol.foundAtLine
  );

  const codeSnippet: CodeSnippet = {
    uri: absolutePath,
    range: {
      start: resolvedSymbol.position,
      end: {
        line: resolvedSymbol.position.line,
        character: resolvedSymbol.position.character + query.symbolName.length,
      },
    },
    content: numberedContent,
    displayRange: {
      startLine: context.startLine,
      endLine: context.endLine,
    },
  };

  return {
    status: 'hasResults',
    locations: [codeSnippet],
    resolvedPosition: resolvedSymbol.position,
    searchRadius: 2,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: [
      ...getHints(TOOL_NAME, 'hasResults'),
      'Note: Using text-based resolution (language server not available)',
      'Install typescript-language-server for semantic definition lookup',
      resolvedSymbol.foundAtLine !== query.lineHint
        ? `Symbol found at line ${resolvedSymbol.foundAtLine} (hint was ${query.lineHint})`
        : undefined,
      'Use lspFindReferences to find all usages',
    ].filter(Boolean) as string[],
  };
}

/**
 * Add line numbers to code content, highlighting the target line
 * @internal Exported for testing
 */
export function addLineNumbers(
  content: string,
  startLine: number,
  targetLine: number
): string {
  const lines = content.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const lineNumWidth = String(maxLineNum).length;

  return lines
    .map((line, index) => {
      const lineNum = startLine + index;
      const paddedNum = String(lineNum).padStart(lineNumWidth, ' ');
      const marker = lineNum === targetLine ? '>' : ' ';
      return `${marker}${paddedNum}| ${line}`;
    })
    .join('\n');
}
