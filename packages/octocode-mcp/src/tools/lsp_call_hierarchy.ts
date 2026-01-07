/**
 * LSP Call Hierarchy tool - traces function call relationships
 * Uses Language Server Protocol for semantic call hierarchy discovery
 * Falls back to pattern matching when LSP is unavailable
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import { getHints } from './hints/index.js';
import {
  validateToolPath,
  createErrorResult,
} from '../utils/file/toolHelpers.js';
import { STATIC_TOOL_NAMES } from './toolNames.js';
import {
  SymbolResolver,
  SymbolResolutionError,
  getOrCreateClient,
  isLanguageServerAvailable,
} from '../lsp/index.js';
import type {
  CallHierarchyResult,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  LSPRange,
  SymbolKind,
  LSPPaginationInfo,
  ExactPosition,
} from '../lsp/types.js';
import { executeBulkOperation } from '../utils/response/bulk.js';
import {
  BulkLSPCallHierarchySchema,
  LSP_CALL_HIERARCHY_DESCRIPTION,
  type LSPCallHierarchyQuery,
} from '../scheme/lsp_call_hierarchy.js';
import { safeExec, checkCommandAvailability } from '../utils/exec/index.js';
import { ToolErrors } from '../errorCodes.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Register the LSP call hierarchy tool with the MCP server.
 */
export function registerLSPCallHierarchyTool(server: McpServer) {
  return server.registerTool(
    'lspCallHierarchy',
    {
      description: LSP_CALL_HIERARCHY_DESCRIPTION,
      inputSchema: BulkLSPCallHierarchySchema,
      annotations: {
        title: 'Call Hierarchy',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: {
      queries: LSPCallHierarchyQuery[];
    }): Promise<CallToolResult> => {
      return executeBulkOperation<LSPCallHierarchyQuery, CallHierarchyResult>(
        args.queries || [],
        async query => await processCallHierarchy(query),
        { toolName: TOOL_NAME }
      );
    }
  );
}

/**
 * Process a single call hierarchy query
 */
async function processCallHierarchy(
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
      } catch (error) {
        // Fall back to pattern matching if LSP fails
        // eslint-disable-next-line no-console
        console.debug('LSP call hierarchy failed, using fallback:', error);
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

/**
 * Use LSP client for semantic call hierarchy
 */
async function callHierarchyWithLSP(
  filePath: string,
  workspaceRoot: string,
  position: ExactPosition,
  query: LSPCallHierarchyQuery,
  content: string
): Promise<CallHierarchyResult | null> {
  const client = await getOrCreateClient(workspaceRoot, filePath);
  if (!client) return null;

  // Prepare call hierarchy to get the item at position
  const items = await client.prepareCallHierarchy(filePath, position);

  if (!items || items.length === 0) {
    return {
      status: 'empty',
      error: 'No callable symbol found at position',
      errorType: 'symbol_not_found',
      direction: query.direction,
      depth: query.depth ?? 1,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'empty'),
        'Language server could not identify a callable symbol',
        'Ensure the position is on a function/method name',
        'Try adjusting lineHint to the exact function declaration line',
      ],
    };
  }

  // Use the first item (usually there's only one)
  // Non-null assertion safe: we checked items.length > 0 above
  const targetItem = items[0]!;

  // Add content snippet to target item
  const enhancedTargetItem = await enhanceCallHierarchyItem(
    targetItem,
    content,
    query.contextLines ?? 2
  );

  // Get calls based on direction
  if (query.direction === 'incoming') {
    const incomingCalls = await client.getIncomingCalls(targetItem);

    if (incomingCalls.length === 0) {
      return {
        status: 'empty',
        item: enhancedTargetItem,
        direction: 'incoming',
        depth: query.depth ?? 1,
        incomingCalls: [],
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          `No callers found for '${query.symbolName}' via Language Server`,
          'The function may not be called directly in the workspace',
          'Check if it is called via alias or dynamic invocation',
          'Try lspFindReferences for broader usage search',
        ],
      };
    }

    // Enhance with content snippets and apply pagination
    const enhancedCalls = await enhanceIncomingCalls(
      incomingCalls,
      query.contextLines ?? 2
    );
    const { paginatedItems, pagination } = paginateResults(
      enhancedCalls,
      query.callsPerPage ?? 15,
      query.page ?? 1
    );

    return {
      status: 'hasResults',
      item: enhancedTargetItem,
      direction: 'incoming',
      depth: query.depth ?? 1,
      incomingCalls: paginatedItems,
      pagination,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'hasResults'),
        `Found ${incomingCalls.length} caller(s) via Language Server`,
        'Use lspGotoDefinition to navigate to each caller',
      ],
    };
  } else {
    // Outgoing calls
    const outgoingCalls = await client.getOutgoingCalls(targetItem);

    if (outgoingCalls.length === 0) {
      return {
        status: 'empty',
        item: enhancedTargetItem,
        direction: 'outgoing',
        depth: query.depth ?? 1,
        outgoingCalls: [],
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          `No callees found in '${query.symbolName}' via Language Server`,
          'The function may only contain primitive operations',
          'Check if calls use dynamic invocation patterns',
        ],
      };
    }

    // Enhance with content snippets and apply pagination
    const enhancedCalls = await enhanceOutgoingCalls(
      outgoingCalls,
      query.contextLines ?? 2
    );
    const { paginatedItems, pagination } = paginateResults(
      enhancedCalls,
      query.callsPerPage ?? 15,
      query.page ?? 1
    );

    return {
      status: 'hasResults',
      item: enhancedTargetItem,
      direction: 'outgoing',
      depth: query.depth ?? 1,
      outgoingCalls: paginatedItems,
      pagination,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'hasResults'),
        `Found ${outgoingCalls.length} callee(s) via Language Server`,
        'Use lspGotoDefinition to navigate to each callee',
      ],
    };
  }
}

/**
 * Fallback: Use pattern matching when LSP is unavailable
 */
async function callHierarchyWithPatternMatching(
  query: LSPCallHierarchyQuery,
  absolutePath: string,
  content: string,
  foundAtLine: number,
  _resolver: SymbolResolver
): Promise<CallHierarchyResult> {
  const lines = content.split(/\r?\n/);
  const targetItem = createCallHierarchyItem(
    query.symbolName,
    absolutePath,
    foundAtLine,
    lines,
    query.contextLines ?? 2
  );

  // Process based on direction
  if (query.direction === 'incoming') {
    return await findIncomingCallsWithPatternMatching(
      query,
      absolutePath,
      targetItem,
      query.depth ?? 1,
      query.callsPerPage ?? 15,
      query.page ?? 1,
      query.contextLines ?? 2
    );
  } else {
    return await findOutgoingCallsWithPatternMatching(
      query,
      absolutePath,
      content,
      targetItem,
      foundAtLine,
      query.depth ?? 1,
      query.callsPerPage ?? 15,
      query.page ?? 1,
      query.contextLines ?? 2
    );
  }
}

/**
 * Find incoming calls using grep/ripgrep (fallback)
 */
async function findIncomingCallsWithPatternMatching(
  query: LSPCallHierarchyQuery,
  targetFilePath: string,
  targetItem: CallHierarchyItem,
  depth: number,
  callsPerPage: number,
  page: number,
  contextLines: number
): Promise<CallHierarchyResult> {
  const workspaceRoot = process.cwd();
  const symbolName = query.symbolName;

  // Search for calls to this function using grep pattern: symbolName(
  const searchPattern = `\\b${escapeRegex(symbolName)}\\s*\\(`;

  // Try ripgrep first, fall back to grep
  const rgAvailable = await checkCommandAvailability('rg');
  let searchResults: CallSite[] = [];

  try {
    if (rgAvailable.available) {
      searchResults = await searchWithRipgrep(
        workspaceRoot,
        searchPattern,
        targetFilePath,
        contextLines
      );
    } else {
      searchResults = await searchWithGrep(
        workspaceRoot,
        searchPattern,
        targetFilePath,
        contextLines
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      error: `Search failed: ${errorMessage}`,
      item: targetItem,
      direction: 'incoming',
      depth,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        'Note: Using text-based search (language server not available)',
        'Search for callers failed',
        'Try using localSearchCode to find calls manually',
        `Pattern: ${symbolName}(`,
      ],
    };
  }

  // Filter out the definition itself
  const callSites = searchResults.filter(
    site =>
      !(
        site.filePath === targetFilePath &&
        site.lineNumber === targetItem.displayRange?.startLine
      )
  );

  if (callSites.length === 0) {
    return {
      status: 'empty',
      item: targetItem,
      direction: 'incoming',
      depth,
      incomingCalls: [],
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'empty'),
        'Note: Using text-based search (language server not available)',
        `No callers found for '${symbolName}'`,
        'The function may not be called directly',
        'Check if it is called via alias or dynamic invocation',
        'Install typescript-language-server for semantic call hierarchy',
      ],
    };
  }

  // Apply pagination
  const totalResults = callSites.length;
  const totalPages = Math.ceil(totalResults / callsPerPage);
  const startIndex = (page - 1) * callsPerPage;
  const paginatedSites = callSites.slice(startIndex, startIndex + callsPerPage);

  // Convert call sites to IncomingCall format
  const incomingCalls: IncomingCall[] = await Promise.all(
    paginatedSites.map(async site => {
      const callerItem = await createCallHierarchyItemFromSite(
        site,
        contextLines
      );
      return {
        from: callerItem,
        fromRanges: [
          {
            start: { line: site.lineNumber - 1, character: site.column },
            end: {
              line: site.lineNumber - 1,
              character: site.column + symbolName.length,
            },
          },
        ],
      };
    })
  );

  const pagination: LSPPaginationInfo = {
    currentPage: page,
    totalPages,
    totalResults,
    hasMore: page < totalPages,
    resultsPerPage: callsPerPage,
  };

  return {
    status: 'hasResults',
    item: targetItem,
    direction: 'incoming',
    depth,
    incomingCalls,
    pagination,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: [
      ...getHints(TOOL_NAME, 'hasResults'),
      'Note: Using text-based search (language server not available)',
      'Install typescript-language-server for semantic call hierarchy',
    ],
  };
}

/**
 * Find outgoing calls using pattern matching (fallback)
 */
async function findOutgoingCallsWithPatternMatching(
  query: LSPCallHierarchyQuery,
  filePath: string,
  content: string,
  targetItem: CallHierarchyItem,
  functionLine: number,
  depth: number,
  callsPerPage: number,
  page: number,
  _contextLines: number
): Promise<CallHierarchyResult> {
  const lines = content.split(/\r?\n/);

  // Extract the function body
  const functionBody = extractFunctionBody(lines, functionLine - 1);
  if (!functionBody) {
    return {
      status: 'empty',
      item: targetItem,
      direction: 'outgoing',
      depth,
      outgoingCalls: [],
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        'Note: Using text-based analysis (language server not available)',
        'Could not extract function body',
        'The function may have unusual syntax',
        'Try using localGetFileContent to read the function manually',
        'Install typescript-language-server for semantic call hierarchy',
      ],
    };
  }

  // Find function calls in the body
  const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  const foundCalls = new Map<string, { line: number; column: number }[]>();

  // JavaScript/TypeScript keywords and built-ins to exclude
  const excludePatterns = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'return',
    'throw',
    'new',
    'typeof',
    'instanceof',
    'void',
    'delete',
    'await',
    'async',
    'class',
    'extends',
    'super',
    'this',
    'import',
    'export',
    'from',
    'as',
    'default',
    'const',
    'let',
    'var',
    // Common built-ins
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'Symbol',
    'BigInt',
    'Math',
    'Date',
    'JSON',
    'console',
    'Promise',
    'Error',
    'RegExp',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'encodeURI',
    'decodeURI',
    'encodeURIComponent',
    'decodeURIComponent',
    query.symbolName, // Exclude self-references for recursion
  ]);

  for (let i = 0; i < functionBody.lines.length; i++) {
    const line = functionBody.lines[i];
    if (!line) continue;

    let match;
    while ((match = callPattern.exec(line)) !== null) {
      const funcName = match[1];
      if (!funcName || excludePatterns.has(funcName)) continue;

      if (!foundCalls.has(funcName)) {
        foundCalls.set(funcName, []);
      }
      foundCalls.get(funcName)!.push({
        line: functionBody.startLine + i + 1, // 1-indexed
        column: match.index,
      });
    }
  }

  const uniqueCalls = Array.from(foundCalls.entries());

  if (uniqueCalls.length === 0) {
    return {
      status: 'empty',
      item: targetItem,
      direction: 'outgoing',
      depth,
      outgoingCalls: [],
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...getHints(TOOL_NAME, 'empty'),
        'Note: Using text-based analysis (language server not available)',
        `No function calls found in '${query.symbolName}'`,
        'The function may only contain primitive operations',
        'Install typescript-language-server for semantic call hierarchy',
      ],
    };
  }

  // Apply pagination
  const totalResults = uniqueCalls.length;
  const totalPages = Math.ceil(totalResults / callsPerPage);
  const startIndex = (page - 1) * callsPerPage;
  const paginatedCalls = uniqueCalls.slice(
    startIndex,
    startIndex + callsPerPage
  );

  // Convert to OutgoingCall format
  const outgoingCalls: OutgoingCall[] = paginatedCalls.map(
    ([funcName, locations]) => {
      const firstLoc = locations[0]!;
      const calleeItem: CallHierarchyItem = {
        name: funcName,
        kind: 'function' as SymbolKind,
        uri: filePath,
        range: createRange(firstLoc.line - 1, firstLoc.column, funcName.length),
        selectionRange: createRange(
          firstLoc.line - 1,
          firstLoc.column,
          funcName.length
        ),
        displayRange: {
          startLine: firstLoc.line,
          endLine: firstLoc.line,
        },
      };

      const fromRanges: LSPRange[] = locations.map(loc =>
        createRange(loc.line - 1, loc.column, funcName.length)
      );

      return {
        to: calleeItem,
        fromRanges,
      };
    }
  );

  const pagination: LSPPaginationInfo = {
    currentPage: page,
    totalPages,
    totalResults,
    hasMore: page < totalPages,
    resultsPerPage: callsPerPage,
  };

  return {
    status: 'hasResults',
    item: targetItem,
    direction: 'outgoing',
    depth,
    outgoingCalls,
    pagination,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: [
      ...getHints(TOOL_NAME, 'hasResults'),
      'Note: Using text-based analysis (language server not available)',
      'Use lspGotoDefinition to find where each callee is defined',
      'Install typescript-language-server for semantic call hierarchy',
    ],
  };
}

// ============================================================================
// Helper functions
// ============================================================================

interface CallSite {
  filePath: string;
  lineNumber: number;
  column: number;
  lineContent: string;
  context?: string;
}

/**
 * Enhance a CallHierarchyItem with content snippet
 */
async function enhanceCallHierarchyItem(
  item: CallHierarchyItem,
  content: string,
  contextLines: number
): Promise<CallHierarchyItem> {
  const lines = content.split(/\r?\n/);
  const startLine = Math.max(0, item.range.start.line - contextLines);
  const endLine = Math.min(
    lines.length - 1,
    item.range.end.line + contextLines
  );

  const snippetLines = lines.slice(startLine, endLine + 1);
  const numberedContent = snippetLines
    .map((line, i) => {
      const lineNum = startLine + i + 1;
      const isTarget =
        lineNum > item.range.start.line && lineNum <= item.range.end.line + 1;
      const marker = isTarget ? '>' : ' ';
      return `${marker}${String(lineNum).padStart(4, ' ')}| ${line}`;
    })
    .join('\n');

  return {
    ...item,
    content: numberedContent,
    displayRange: {
      startLine: startLine + 1,
      endLine: endLine + 1,
    },
  };
}

/**
 * Enhance incoming calls with content snippets
 */
async function enhanceIncomingCalls(
  calls: IncomingCall[],
  contextLines: number
): Promise<IncomingCall[]> {
  const enhanced: IncomingCall[] = [];

  for (const call of calls) {
    try {
      const fileContent = await readFile(call.from.uri, 'utf-8');
      const enhancedFrom = await enhanceCallHierarchyItem(
        call.from,
        fileContent,
        contextLines
      );
      enhanced.push({
        ...call,
        from: enhancedFrom,
      });
    } catch {
      // Keep original if file read fails
      enhanced.push(call);
    }
  }

  return enhanced;
}

/**
 * Enhance outgoing calls with content snippets
 */
async function enhanceOutgoingCalls(
  calls: OutgoingCall[],
  contextLines: number
): Promise<OutgoingCall[]> {
  const enhanced: OutgoingCall[] = [];

  for (const call of calls) {
    try {
      const fileContent = await readFile(call.to.uri, 'utf-8');
      const enhancedTo = await enhanceCallHierarchyItem(
        call.to,
        fileContent,
        contextLines
      );
      enhanced.push({
        ...call,
        to: enhancedTo,
      });
    } catch {
      // Keep original if file read fails
      enhanced.push(call);
    }
  }

  return enhanced;
}

/**
 * Paginate results
 */
function paginateResults<T>(
  items: T[],
  perPage: number,
  page: number
): { paginatedItems: T[]; pagination: LSPPaginationInfo } {
  const totalResults = items.length;
  const totalPages = Math.ceil(totalResults / perPage);
  const startIndex = (page - 1) * perPage;
  const paginatedItems = items.slice(startIndex, startIndex + perPage);

  return {
    paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalResults,
      hasMore: page < totalPages,
      resultsPerPage: perPage,
    },
  };
}

/**
 * Search for pattern using ripgrep
 */
async function searchWithRipgrep(
  workspaceRoot: string,
  pattern: string,
  _excludeFile: string,
  contextLines: number
): Promise<CallSite[]> {
  const args = [
    '--json',
    '--line-number',
    '--column',
    '-e',
    pattern,
    '--type',
    'ts',
    '--type',
    'js',
    '--type',
    'tsx',
    '--type',
    'jsx',
    '--type-add',
    'tsx:*.tsx',
    '--type-add',
    'jsx:*.jsx',
    '-C',
    String(contextLines),
    workspaceRoot,
  ];

  const result = await safeExec('rg', args, {
    cwd: workspaceRoot,
    timeout: 30000,
  });

  if (!result.success && result.code !== 1) {
    throw new Error(result.stderr || 'ripgrep search failed');
  }

  return parseRipgrepJsonOutput(result.stdout);
}

/**
 * Search for pattern using grep (fallback)
 */
async function searchWithGrep(
  workspaceRoot: string,
  pattern: string,
  _excludeFile: string,
  _contextLines: number
): Promise<CallSite[]> {
  const args = [
    '-r',
    '-n',
    '-E',
    '--include=*.ts',
    '--include=*.js',
    '--include=*.tsx',
    '--include=*.jsx',
    pattern,
    workspaceRoot,
  ];

  const result = await safeExec('grep', args, {
    cwd: workspaceRoot,
    timeout: 30000,
  });

  if (!result.success && result.code !== 1) {
    throw new Error(result.stderr || 'grep search failed');
  }

  return parseGrepOutput(result.stdout);
}

/**
 * Parse ripgrep JSON output
 * @internal Exported for testing
 */
export function parseRipgrepJsonOutput(output: string): CallSite[] {
  const results: CallSite[] = [];
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.type === 'match' && json.data) {
        const data = json.data;
        results.push({
          filePath: data.path?.text || '',
          lineNumber: data.line_number || 0,
          column: data.submatches?.[0]?.start || 0,
          lineContent: data.lines?.text || '',
        });
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return results;
}

/**
 * Parse grep output (file:line:content format)
 * @internal Exported for testing
 */
export function parseGrepOutput(output: string): CallSite[] {
  const results: CallSite[] = [];
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (match) {
      const [, filePath, lineNum, content] = match;
      results.push({
        filePath: filePath || '',
        lineNumber: parseInt(lineNum || '0', 10),
        column: 0,
        lineContent: content || '',
      });
    }
  }

  return results;
}

/**
 * Create a CallHierarchyItem from source information
 */
function createCallHierarchyItem(
  name: string,
  uri: string,
  lineNumber: number,
  lines: string[],
  contextLines: number
): CallHierarchyItem {
  const startLine = Math.max(0, lineNumber - 1 - contextLines);
  const endLine = Math.min(lines.length - 1, lineNumber - 1 + contextLines);

  const contextContent = lines.slice(startLine, endLine + 1).join('\n');
  const line = lines[lineNumber - 1] || '';
  const column = line.indexOf(name);

  return {
    name,
    kind: inferSymbolKind(line),
    uri,
    range: {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: lines[endLine]?.length || 0 },
    },
    selectionRange: {
      start: { line: lineNumber - 1, character: Math.max(0, column) },
      end: {
        line: lineNumber - 1,
        character: Math.max(0, column) + name.length,
      },
    },
    content: contextContent,
    displayRange: {
      startLine: startLine + 1,
      endLine: endLine + 1,
    },
  };
}

/**
 * Create CallHierarchyItem from a call site
 */
async function createCallHierarchyItemFromSite(
  site: CallSite,
  contextLines: number
): Promise<CallHierarchyItem> {
  let enclosingFunctionName = 'unknown';
  let content = site.lineContent;

  try {
    const fileContent = await readFile(site.filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);

    // Look backwards for function declaration
    for (
      let i = site.lineNumber - 1;
      i >= 0 && i >= site.lineNumber - 20;
      i--
    ) {
      const line = lines[i];
      if (!line) continue;

      const funcMatch = line.match(
        /(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function|\(|[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s*\()/
      );
      if (funcMatch) {
        enclosingFunctionName =
          funcMatch[1] ||
          funcMatch[2] ||
          funcMatch[3] ||
          funcMatch[4] ||
          'unknown';
        break;
      }

      const methodMatch = line.match(
        /(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/
      );
      if (methodMatch && methodMatch[1]) {
        enclosingFunctionName = methodMatch[1];
        break;
      }
    }

    // Get context
    const startLine = Math.max(0, site.lineNumber - 1 - contextLines);
    const endLine = Math.min(
      lines.length - 1,
      site.lineNumber - 1 + contextLines
    );
    content = lines.slice(startLine, endLine + 1).join('\n');
  } catch {
    // Use default values if file read fails
  }

  return {
    name: enclosingFunctionName,
    kind: 'function' as SymbolKind,
    uri: site.filePath,
    range: createRange(site.lineNumber - 1, 0, site.lineContent.length),
    selectionRange: createRange(site.lineNumber - 1, site.column, 10),
    content,
    displayRange: {
      startLine: site.lineNumber,
      endLine: site.lineNumber,
    },
  };
}

/**
 * Extract function body starting from a line
 * @internal Exported for testing
 */
export function extractFunctionBody(
  lines: string[],
  startLineIndex: number
): { lines: string[]; startLine: number; endLine: number } | null {
  let braceCount = 0;
  let foundStart = false;
  let bodyStartLine = startLineIndex;
  const bodyLines: string[] = [];

  // Find the opening brace
  for (
    let i = startLineIndex;
    i < Math.min(lines.length, startLineIndex + 5);
    i++
  ) {
    const line = lines[i];
    if (!line) continue;

    const braceIndex = line.indexOf('{');
    if (braceIndex !== -1) {
      foundStart = true;
      bodyStartLine = i;
      braceCount = 1;

      for (let j = braceIndex + 1; j < line.length; j++) {
        if (line[j] === '{') braceCount++;
        if (line[j] === '}') braceCount--;
      }

      bodyLines.push(line.slice(braceIndex + 1));
      break;
    }
  }

  if (!foundStart) return null;

  // Continue until we find the matching closing brace
  for (let i = bodyStartLine + 1; i < lines.length && braceCount > 0; i++) {
    const line = lines[i];
    if (!line) {
      bodyLines.push('');
      continue;
    }

    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    if (braceCount > 0) {
      bodyLines.push(line);
    } else {
      const lastBraceIndex = line.lastIndexOf('}');
      if (lastBraceIndex > 0) {
        bodyLines.push(line.slice(0, lastBraceIndex));
      }
    }
  }

  return {
    lines: bodyLines,
    startLine: bodyStartLine,
    endLine: bodyStartLine + bodyLines.length,
  };
}

/**
 * Infer symbol kind from line content
 * @internal Exported for testing
 */
export function inferSymbolKind(line: string): SymbolKind {
  if (/\bclass\b/.test(line)) return 'class';
  if (/\binterface\b/.test(line)) return 'interface';
  if (/\btype\b/.test(line)) return 'type';
  if (/\bconst\b/.test(line) && !/=.*(?:function|\(.*\)\s*=>)/.test(line))
    return 'constant';
  if (/\b(?:let|var)\b/.test(line) && !/=.*(?:function|\(.*\)\s*=>)/.test(line))
    return 'variable';
  if (/\benum\b/.test(line)) return 'enum';
  if (/\bnamespace\b/.test(line)) return 'namespace';
  if (/\bmodule\b/.test(line)) return 'module';
  return 'function';
}

/**
 * Create an LSP range
 * @internal Exported for testing
 */
export function createRange(
  line: number,
  character: number,
  length: number
): LSPRange {
  return {
    start: { line, character },
    end: { line, character: character + length },
  };
}

/**
 * Escape special regex characters
 * @internal Exported for testing
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
