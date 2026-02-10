/**
 * Helper functions for call hierarchy operations
 */

import { readFile } from 'fs/promises';
import type {
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  LSPRange,
  SymbolKind,
  LSPPaginationInfo,
} from '../../lsp/types.js';

/**
 * Call site information from pattern matching
 */
export interface CallSite {
  filePath: string;
  lineNumber: number;
  column: number;
  lineContent: string;
  context?: string;
}

/**
 * Create a unique key for a call hierarchy item to detect cycles.
 * Uses file path and line number as the key.
 */
export function createCallItemKey(item: CallHierarchyItem): string {
  return `${item.uri}:${item.range.start.line}:${item.name}`;
}

/**
 * Enhance a CallHierarchyItem with content snippet
 */
export async function enhanceCallHierarchyItem(
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
export async function enhanceIncomingCalls(
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
export async function enhanceOutgoingCalls(
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
export function paginateResults<T>(
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
 * Create a CallHierarchyItem from source information
 */
export function createCallHierarchyItem(
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
export async function createCallHierarchyItemFromSite(
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
 * Infer symbol kind from line content
 * @internal Exported for testing
 */
export function inferSymbolKind(line: string): SymbolKind {
  if (/\bclass\b/.test(line)) return 'class';
  if (/\binterface\b/.test(line)) return 'interface';
  if (/\btype\b/.test(line)) return 'type';
  if (/\bconst\b/.test(line) && !/=.*(?:function|\([^)]*\)\s*=>)/.test(line))
    return 'constant';
  if (
    /\b(?:let|var)\b/.test(line) &&
    !/=.*(?:function|\([^)]*\)\s*=>)/.test(line)
  )
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
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
