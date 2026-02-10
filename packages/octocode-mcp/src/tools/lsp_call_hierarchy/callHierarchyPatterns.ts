/**
 * Pattern matching fallback for call hierarchy when LSP is unavailable
 */

import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { SymbolResolver } from '../../lsp/index.js';
import { RipgrepMatchOnlySchema } from '../../utils/parsers/schemas.js';
import { safeExec, checkCommandAvailability } from '../../utils/exec/index.js';
import type {
  CallHierarchyResult,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  LSPRange,
  SymbolKind,
  LSPPaginationInfo,
} from '../../lsp/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import {
  CallSite,
  createCallHierarchyItem,
  createCallHierarchyItemFromSite,
  createRange,
  escapeRegex,
} from './callHierarchyHelpers.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Fallback: Use pattern matching when LSP is unavailable
 */
export async function callHierarchyWithPatternMatching(
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
      const raw = JSON.parse(line);
      const validation = RipgrepMatchOnlySchema.safeParse(raw);
      if (!validation.success) continue;
      const data = validation.data.data;
      results.push({
        filePath: data.path.text,
        lineNumber: data.line_number,
        column: data.submatches?.[0]?.start || 0,
        lineContent: data.lines.text,
      });
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
    const match = line.match(/:(\d+):/);
    if (match?.index && match.index > 0) {
      const filePath = line.substring(0, match.index);
      const lineNum = match[1]!;
      const content = line.substring(match.index + match[0].length);
      results.push({
        filePath,
        lineNumber: parseInt(lineNum, 10),
        column: 0,
        lineContent: content,
      });
    }
  }

  return results;
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
