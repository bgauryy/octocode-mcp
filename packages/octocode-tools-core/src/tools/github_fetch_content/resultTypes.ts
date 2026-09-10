import type {
  FetchPagination,
  LocalFetchToolResult,
} from '@octocodeai/octocode-core/extra-types';
import type { ToolContinuation } from '../../scheme/pagination.js';
import type {
  BulkToolResultRow,
  ResponsePaginationInfo,
} from '../../types/toolOutput.js';

// ---------------------------------------------------------------------------
// Output TYPES — describes what ghGetFileContent returns. No zod: the MCP
// server registers no outputSchema. The result rows carry an OPTIONAL `data`
// (error rows omit it), so this uses a bespoke envelope rather than the
// data-required BulkToolOutput generic.
// ---------------------------------------------------------------------------

export interface GitHubFetchFileEntry {
  path: string;
  content: string;
  contentView?: 'none' | 'standard' | 'symbols';
  totalLines?: number;
  sourceChars?: number;
  sourceBytes?: number;
  returnedChars?: number;
  returnedBytes?: number;
  returnedLines?: number;
  selectedMatchCount?: number;
  minifyFallback?: LocalFetchToolResult['minifyFallback'];
  resolvedBranch?: string;
  commitSha?: string;
  pagination?: FetchPagination;
  next?: Record<string, ToolContinuation>;
  isPartial?: boolean;
  startLine?: number;
  endLine?: number;
  matchRanges?: Array<{ start: number; end: number }>;
  lastModified?: string;
  lastModifiedBy?: string;
  warnings?: string[];
  matchNotFound?: boolean;
  searchedFor?: string;
  cached?: boolean;
}

export interface GitHubFetchContentData {
  owner: string;
  repo: string;
  files?: GitHubFetchFileEntry[];
}

export interface GitHubFetchContentErrorData {
  owner?: string;
  repo?: string;
  path?: string;
  error: string;
}

export interface GitHubFetchContentOutputLocal {
  base?: string;
  shared?: Record<string, string | number | boolean>;
  responsePagination?: ResponsePaginationInfo;
  results: Array<
    BulkToolResultRow<GitHubFetchContentData | GitHubFetchContentErrorData>
  >;
  // Index signature: satisfies BulkFinalizer's `TOutput extends
  // Record<string, unknown>` constraint (the old zod-inferred type did too).
  [key: string]: unknown;
}
