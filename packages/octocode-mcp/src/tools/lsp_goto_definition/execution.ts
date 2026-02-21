/**
 * LSP Go To Definition execution logic
 * @module tools/lsp_goto_definition/execution
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import { dirname, resolve as resolvePath } from 'path';

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
import {
  applyOutputSizeLimit,
  serializeForPagination,
} from '../../utils/pagination/index.js';
import { safeReadFile } from '../../lsp/validation.js';

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
            query.orderHint && query.orderHint > 0
              ? `orderHint=${query.orderHint} targets the ${query.orderHint + 1}th code occurrence on the exact line`
              : undefined,
            query.orderHint && query.orderHint > 0
              ? 'orderHint skips string/comment text matches and does not apply to nearby fallback lines'
              : undefined,
            query.orderHint && query.orderHint > 0
              ? 'Try orderHint=0 if the symbol appears once in code on that line'
              : undefined,
          ].filter(Boolean) as string[],
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
        if (result) return applyGotoDefinitionOutputLimit(result, query);
      } catch {
        // LSP failed — fall back to text resolution silently
      }
    }

    // Fallback: Return the resolved position as the "definition"
    // This is less accurate but works without a language server
    return applyGotoDefinitionOutputLimit(
      createFallbackResult(query, absolutePath, content, resolver, resolvedSymbol),
      query
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
 * Detect whether a line of code is an import or re-export statement.
 * Used to determine if a goto-definition result resolved to an import
 * rather than the actual source definition.
 *
 * Covers TypeScript/JavaScript patterns:
 * - import { Foo } from './module'
 * - import Foo from './module'
 * - import * as Foo from './module'
 * - export { Foo } from './module'
 * - export * from './module'
 * - export { default as Foo } from './module'
 *
 * @internal Exported for testing
 */
export function isImportOrReExport(lineContent: string): boolean {
  const trimmed = lineContent.trim();
  return /^(?:import|export)\s+.*\bfrom\b\s+['"]/.test(trimmed);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve the best cursor character for a second-hop goto-definition call
 * on import/re-export lines. Prefers the queried symbol token position
 * before the "from" clause to avoid matching module path text.
 */
export function resolveImportSymbolCharacter(
  lineContent: string,
  symbolName: string,
  fallbackCharacter: number
): number {
  if (!lineContent || !symbolName) return fallbackCharacter;

  const fromMatch = /\bfrom\b/.exec(lineContent);
  const searchScope = fromMatch
    ? lineContent.slice(0, fromMatch.index)
    : lineContent;
  const symbolRegex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`);
  const match = symbolRegex.exec(searchScope);

  return match ? match.index : fallbackCharacter;
}

/**
 * Use LSP client to find definition, with automatic import chaining.
 * If the LSP resolves to an import/re-export in the same file,
 * performs one additional hop to follow the import to the source definition.
 */
async function gotoDefinitionWithLSP(
  filePath: string,
  workspaceRoot: string,
  _position: ExactPosition,
  query: LSPGotoDefinitionQuery,
  _content: string
): Promise<GotoDefinitionResult | null> {
  const client = await createClient(workspaceRoot, filePath);
  if (!client) return null;

  try {
    let locations = await client.gotoDefinition(filePath, _position);

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

    // Auto-chain through imports: if the result points to an import/re-export
    // in the same file, perform one additional hop to follow the import to the source definition.
    //
    // Known limitation: TypeScript projects using .js extension imports (ESM) cause
    // the LSP to return the import declaration line as the "definition" rather than
    // following to the source file. The second LSP hop would use the same (file, position)
    // and loop. We detect this and fall back to manual module-path resolution.
    let followedImport = false;
    if (locations.length === 1) {
      const loc = locations[0]!;
      const isSameFile = loc.uri === filePath;

      if (isSameFile) {
        try {
          const locContent = await safeReadFile(loc.uri);
          if (!locContent) throw new Error('Cannot read file');
          const lines = locContent.split(/\r?\n/);
          const targetLine = lines[loc.range.start.line];

          if (targetLine && isImportOrReExport(targetLine)) {
            const importPosition: ExactPosition = {
              line: loc.range.start.line,
              character: resolveImportSymbolCharacter(
                targetLine,
                query.symbolName,
                loc.range.start.character
              ),
            };

            // Try LSP chaining: ask the language server to follow the import.
            // This works when TypeScript is properly configured (non-.js imports).
            let chainedToSource = false;
            const chainedLocations = await client.gotoDefinition(
              loc.uri,
              importPosition
            );
            if (chainedLocations && chainedLocations.length > 0) {
              const resolvedToDifferentFile = chainedLocations.some(
                cl => cl.uri !== filePath
              );
              if (resolvedToDifferentFile) {
                locations = chainedLocations.filter(cl => cl.uri !== filePath);
                followedImport = true;
                chainedToSource = true;
              }
            }

            // Fallback: LSP chaining returned the same file (TypeScript ESM .js→.ts
            // limitation — the LSP cannot cross from the import declaration to the
            // source file). Resolve the module path manually and text-search for the
            // exported symbol in the .ts source file.
            if (!chainedToSource) {
              const manualLocation = await resolveDefinitionViaModulePath(
                targetLine,
                loc.uri,
                query.symbolName
              );
              if (manualLocation) {
                locations = [manualLocation];
                followedImport = true;
              }
            }
          }
        } catch {
          // If chaining fails, continue with original result
        }
      }
    }

    // Enhance snippets with context lines
    const contextLines = query.contextLines ?? 5;
    const enhancedLocations: CodeSnippet[] = [];

    for (const loc of locations) {
      try {
        const locContent = await safeReadFile(loc.uri);
        if (!locContent) {
          enhancedLocations.push(loc);
          continue;
        }
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
      resolvedPosition: _position,
      searchRadius: 5,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'hasResults'),
        `Found ${locations.length} definition(s) via Language Server`,
        followedImport
          ? 'Followed import chain to source definition'
          : undefined,
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
 * Fallback for TypeScript ESM projects that use `.js` extension imports.
 *
 * When TypeScript LSP cannot follow `import { X } from './y.js'` to `y.ts`
 * (because the language server only sees the local import binding as the
 * "definition"), we resolve the module path manually:
 *  1. Parse the `from '...'` clause in the import line.
 *  2. Map `.js` → `.ts` (TypeScript ESM convention).
 *  3. Text-search the target file for the first `export` line that
 *     contains the symbol name.
 *
 * Returns a minimal Location object compatible with the locations array, or
 * null when the module cannot be resolved or the symbol is not found.
 */
async function resolveDefinitionViaModulePath(
  importLine: string,
  sourceFileUri: string,
  symbolName: string
): Promise<CodeSnippet | null> {
  const fromMatch = /\bfrom\s+['"](.+?)['"]\s*;?\s*$/.exec(importLine);
  if (!fromMatch?.[1]) return null;

  const modulePath = fromMatch[1];
  if (!modulePath.startsWith('.')) return null; // only relative imports

  const sourceDir = dirname(sourceFileUri);
  let resolvedPath = resolvePath(sourceDir, modulePath);

  // TypeScript ESM: imports use .js extension but source files are .ts
  if (resolvedPath.endsWith('.js')) {
    resolvedPath = resolvedPath.replace(/\.js$/, '.ts');
  }

  const content = await safeReadFile(resolvedPath);
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*export\b/.test(line) && line.includes(symbolName)) {
      const charIdx = line.indexOf(symbolName);
      return {
        uri: resolvedPath,
        // content is a placeholder — the caller's location-enhancing loop
        // will re-read the file and replace this with the proper snippet
        content: '',
        range: {
          start: { line: i, character: charIdx },
          end: { line: i, character: charIdx + symbolName.length },
        },
      };
    }
  }

  return null;
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
    searchRadius: 5,
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
 * Apply output size limits with charOffset/charLength pagination.
 * Follows the same pattern used by lspCallHierarchy.
 */
function applyGotoDefinitionOutputLimit(
  result: GotoDefinitionResult,
  query: LSPGotoDefinitionQuery
): GotoDefinitionResult {
  if (result.status !== 'hasResults') return result;

  const serialized = serializeForPagination(result, true);
  const sizeLimitResult = applyOutputSizeLimit(serialized, {
    charOffset: query.charOffset,
    charLength: query.charLength,
  });

  if (!sizeLimitResult.wasLimited || !sizeLimitResult.pagination) return result;

  const { pagination } = sizeLimitResult;
  return {
    ...result,
    outputPagination: {
      charOffset: pagination.charOffset!,
      charLength: pagination.charLength!,
      totalChars: pagination.totalChars!,
      hasMore: pagination.hasMore,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
    },
    hints: [
      ...(result.hints || []),
      ...sizeLimitResult.warnings,
      ...sizeLimitResult.paginationHints,
    ],
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
