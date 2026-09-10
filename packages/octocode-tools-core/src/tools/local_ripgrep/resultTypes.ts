import type {
  LocalItemPagination,
  ToolContinuation,
} from '../../scheme/pagination.js';

// ---------------------------------------------------------------------------
// Output TYPES — describes what local text search returns per query result row.
// No zod: the MCP server registers no outputSchema, so the output is a plain
// type. Shared envelope lives in types/toolOutput.ts.
// ---------------------------------------------------------------------------

export interface LocalSearchMatch {
  line: number;
  endLine?: number;
  value?: string;
  column?: number;
  endColumn?: number;
  count?: number;
  metavars?: Record<string, string[]>;
  metavarRanges?: Record<
    string,
    Array<{
      text: string;
      line: number;
      column: number;
      endLine: number;
      endColumn: number;
    }>
  >;
}

export interface LocalSearchFile {
  path: string;
  absolutePath?: string;
  uri?: string;
  matches?: LocalSearchMatch[];
  totalOccurrences?: number;
  totalMatchedLines?: number;
  totalMatchRows?: number;
  returnedMatchRows?: number;
  ranking?: {
    score: number;
    profile?: string;
    pathRole?: string;
    reasons?: string[];
  };
  matchPagination?: LocalItemPagination;
  pagination?: LocalItemPagination;
  next?: Record<string, ToolContinuation>;
}

export interface LocalSearchCodeData {
  files?: LocalSearchFile[];
  summary?: string;
  searchEngine?: string;
  stats?: {
    totalOccurrences?: number;
    matchedLines?: number;
    filesMatched?: number;
    filesSearched?: number;
    bytesSearched?: number;
    searchTime?: string;
    [key: string]: unknown;
  };
  pagination?: LocalItemPagination;
  next?: Record<string, ToolContinuation>;
  terminalLimit?: boolean;
  truncated?: boolean;
  partialReasons?: Array<'maxFiles' | 'structuralLimit' | 'skippedFiles'>;
  diagnostics?: Array<{
    code: string;
    severity: string;
    stage: string;
    message: string;
    path?: string;
    recovery?: string;
  }>;
}
