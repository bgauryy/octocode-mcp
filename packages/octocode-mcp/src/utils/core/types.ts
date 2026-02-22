/**
 * Core type definitions for local-explorer-mcp MCP server
 */

import type { LocalToolErrorCode as ErrorCode } from '../../errorCodes.js';

/**
 * Command execution result
 */
export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Command execution options
 */
export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  maxOutputSize?: number;
  /** Tool name for memory tracking (optional) */
  toolName?: string;
}

/**
 * Path validation result for security checks
 */
export interface PathValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedPath?: string;
}

/**
 * Base query schema fields (inherited from octocode-mcp)
 */
export interface BaseQuery {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Pagination information for all tools
 * Supports both character-based and entity-based pagination
 *
 * Contains both byte-based and character-based offsets:
 * - Byte offsets: For GitHub API compatibility and binary operations
 * - Character offsets: For JavaScript string operations (substring, slice)
 *
 * IMPORTANT: These are NOT interchangeable for multi-byte UTF-8 content (emojis, CJK, etc.)
 */
export interface PaginationInfo {
  /** Current page number (1-based) - REQUIRED */
  currentPage: number;
  /** Total pages - REQUIRED */
  totalPages: number;
  /** More pages available - REQUIRED */
  hasMore: boolean;

  // Character-based pagination (for JavaScript string operations)
  /** Current character offset (for use with string.substring) */
  charOffset?: number;
  /** Page size in characters (for use with string.length) */
  charLength?: number;
  /** Total size in characters */
  totalChars?: number;

  // Entity-based pagination - tool-specific
  /** Files per page (for find_files, ripgrep file pagination) */
  filesPerPage?: number;
  /** Total files (for find_files, ripgrep file pagination) */
  totalFiles?: number;
  /** Entries per page (for view_structure) */
  entriesPerPage?: number;
  /** Total entries (for view_structure) */
  totalEntries?: number;
  /** Matches per page (for ripgrep per-file match pagination) */
  matchesPerPage?: number;
  /** Total matches (for ripgrep per-file match pagination) */
  totalMatches?: number;
}

/**
 * Search content result (used by ripgrep) - NEW STRUCTURED FORMAT
 */
export interface SearchContentResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  warnings?: string[]; // Validation warnings

  // NEW: Structured matches grouped by file
  files?: RipgrepFileMatches[]; // Array of files with their matches (paginated)

  // File-level pagination (NEW)
  pagination?: {
    currentPage: number; // Current file page (1-based)
    totalPages: number; // Total pages of files
    filesPerPage: number; // Files per page
    totalFiles: number; // Total files with matches
    hasMore: boolean; // More file pages available
  };

  // Index signature for ProcessedBulkResult compatibility
  [key: string]: unknown;
}

/**
 * Search statistics (ripgrep --stats)
 */
export interface SearchStats {
  matchCount?: number;
  matchedLines?: number;
  filesMatched?: number;
  filesSearched?: number;
  bytesSearched?: number;
  searchTime?: string;
}

/**
 * Structured representation of a single match (NEW FORMAT)
 */
export interface RipgrepMatch {
  value: string; // Match + context, max 200 chars
  line: number; // Line number (1-indexed) — use as lineHint for LSP tools
  column?: number; // Column number (0-indexed) for human reference
}

/**
 * File with its matches grouped together
 */
export interface RipgrepFileMatches {
  path: string; // Absolute path
  matchCount: number; // Total matches in this file (across all pages)
  matches: RipgrepMatch[]; // Array of matches (paginated)
  modified?: string; // ISO timestamp of last modification
  pagination?: {
    currentPage: number; // Current match page for this file (1-based)
    totalPages: number; // Total pages of matches in this file
    matchesPerPage: number; // Matches per page
    totalMatches: number; // Total matches in this file
    hasMore: boolean; // More matches available in this file
  };
}

/**
 * View structure query parameters
 */
export interface ViewStructureQuery extends BaseQuery {
  path: string;
  details?: boolean;
  hidden?: boolean;
  humanReadable?: boolean;
  sortBy?: 'name' | 'size' | 'time' | 'extension';
  reverse?: boolean;
  pattern?: string;
  directoriesOnly?: boolean;
  filesOnly?: boolean;
  extension?: string;
  extensions?: string[];
  depth?: number;
  recursive?: boolean;
  limit?: number;
  summary?: boolean;

  // Entry-based pagination (NEW)
  entriesPerPage?: number;
  entryPageNumber?: number;

  // Character-based pagination (legacy support)
  charOffset?: number;
  charLength?: number;

  showFileLastModified?: boolean;
}

/**
 * View structure result
 */
export interface ViewStructureResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  entries?: Array<{
    name: string;
    type: 'file' | 'dir' | 'link';
    depth?: number;
    size?: string;
    modified?: string;
    permissions?: string;
  }>;
  summary?: string;
  errorCode?: ErrorCode;
  hints?: readonly string[];

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;
  charPagination?: PaginationInfo;

  // Index signature for ProcessedBulkResult compatibility
  [key: string]: unknown;
}

/**
 * Find files query parameters
 */
export interface FindFilesQuery extends BaseQuery {
  path: string;
  maxDepth?: number;
  minDepth?: number;
  name?: string;
  iname?: string;
  names?: string[];
  pathPattern?: string;
  regex?: string;
  regexType?: 'posix-egrep' | 'posix-extended' | 'posix-basic';
  type?: 'f' | 'd' | 'l' | 'b' | 'c' | 'p' | 's';
  empty?: boolean;
  modifiedWithin?: string;
  modifiedBefore?: string;
  accessedWithin?: string;
  sizeGreater?: string;
  sizeLess?: string;
  permissions?: string;
  executable?: boolean;
  readable?: boolean;
  writable?: boolean;
  excludeDir?: string[];
  limit?: number;
  details?: boolean;
  sortBy?: 'modified' | 'size' | 'name' | 'path';

  // File-based pagination (NEW)
  filesPerPage?: number;
  filePageNumber?: number;

  // Character-based pagination (legacy support)
  charOffset?: number;
  charLength?: number;

  showFileLastModified?: boolean;
}

/**
 * Found file result
 */
export interface FoundFile {
  path: string;
  type: string;
  size?: number;
  modified?: string;
  permissions?: string;
}

/**
 * Find files result
 */
export interface FindFilesResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  files?: FoundFile[];
  errorCode?: ErrorCode;
  hints?: readonly string[];

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;
  charPagination?: PaginationInfo;

  // Index signature for ProcessedBulkResult compatibility
  [key: string]: unknown;
}

/**
 * Fetch content query parameters
 */
export interface FetchContentQuery extends BaseQuery {
  path: string;
  fullContent?: boolean;
  matchString?: string;
  matchStringContextLines?: number;
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;

  // Line-based extraction (aligned with GitHub's githubGetFileContent)
  startLine?: number;
  endLine?: number;

  // Character-based pagination (universal mechanism)
  charOffset?: number;
  charLength?: number;
}

/**
 * Fetch content result
 */
export interface FetchContentResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  content?: string;
  isPartial?: boolean;
  totalLines?: number;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  warnings?: string[];

  // Line extraction info (when startLine/endLine or matchString used)
  startLine?: number;
  endLine?: number;
  // Match ranges (only present when matchString is used)
  matchRanges?: Array<{ start: number; end: number }>;

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;

  // Index signature for ProcessedBulkResult compatibility
  [key: string]: unknown;
}

/**
 * Cache statistics for monitoring and debugging
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  totalKeys: number;
  lastReset: Date;
}
