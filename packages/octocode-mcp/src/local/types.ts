/**
 * Core type definitions for local-explorer-mcp MCP server
 */

import type { ErrorCode } from './errors/errorCodes.js';

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
 * Validation result for security checks
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedPath?: string;
}

/**
 * Base query schema fields (inherited from octocode-mcp)
 */
export interface BaseQuery {
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Pagination information for all tools
 * Supports both character-based and entity-based pagination
 */
export interface PaginationInfo {
  /** Current page number (1-based) - REQUIRED */
  currentPage: number;
  /** Total pages - REQUIRED */
  totalPages: number;
  /** More pages available - REQUIRED */
  hasMore: boolean;

  // Character-based pagination (for all tools when using charLength)
  /** Current character offset */
  charOffset?: number;
  /** Page size in characters */
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
  totalMatches?: number; // Total number of matches across all files
  totalFiles?: number; // Total number of files with matches (across all pages)

  // File-level pagination (NEW)
  pagination?: {
    currentPage: number; // Current file page (1-based)
    totalPages: number; // Total pages of files
    filesPerPage: number; // Files per page
    totalFiles: number; // Total files with matches
    hasMore: boolean; // More file pages available
  };

  // Optional metadata
  searchEngine?: 'rg'; // Which search engine was used
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
  location: {
    /**
     * WARNING: This is a BYTE offset, not a character/codepoint offset!
     *
     * Ripgrep returns byte offsets in the file's encoding. For UTF-8 files with
     * multi-byte characters (é, 中, emoji), byte offset ≠ character offset.
     *
     * Example: In "Hello 世界 World"
     * - "World" byte offset: 13 (each Chinese char = 3 bytes)
     * - "World" character offset: 7
     *
     * For ASCII-only files: byte offset = character offset ✓
     * For UTF-8 with multi-byte chars: conversion required
     *
     * Integration: FETCH_CONTENT expects byte offsets, so this works directly.
     */
    charOffset: number;

    /**
     * WARNING: This is a BYTE length, not character length!
     * See charOffset warning above for details.
     */
    charLength: number;
  };
  // Optional metadata for reference
  line?: number; // Line number (1-indexed) for human reference
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
 * Metadata about the search that was performed
 */
export interface SearchMetadata {
  pattern: string; // Search pattern
  path: string; // Search root path
  mode?: 'discovery' | 'paginated' | 'detailed';

  // Search parameters
  caseSensitivity: 'smart' | 'sensitive' | 'insensitive';
  regexType: 'fixed' | 'basic' | 'perl';

  // Filtering
  fileFilters?: string[]; // Include/exclude patterns
  excludeDirs?: string[]; // Excluded directories

  // Output control
  contextLines: number; // Lines of context requested
  maxMatchesPerFile: number; // Limit per file
  filesOnly: boolean; // Whether only filenames returned

  // Execution info
  timestamp: string; // When search was executed
}

/**
 * Distribution analysis of matches across files
 */
export interface MatchDistribution {
  file: string; // File path
  matchCount: number; // Total matches in this file
  percentage: number; // Percentage of total matches
  lines: number[]; // Line numbers with matches
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
  structuredOutput?: string; // Compact indented string format
  totalFiles?: number;
  totalDirectories?: number;
  totalSize?: number;
  errorCode?: ErrorCode;
  hints?: readonly string[];

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;
  charPagination?: PaginationInfo; // Character-based pagination metadata
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
  totalFiles?: number;
  errorCode?: ErrorCode;
  hints?: readonly string[];

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;
  charPagination?: PaginationInfo;
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
  minified?: boolean;

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
  contentLength?: number;
  isPartial?: boolean;
  totalLines?: number;
  minificationFailed?: boolean;
  errorCode?: ErrorCode;
  hints?: readonly string[];

  // Pagination metadata (only present when pagination is active)
  pagination?: PaginationInfo;
}

/**
 * Bulk operation query wrapper
 */
export interface BulkQuery<T> {
  queries: T[];
}

/**
 * Bulk operation result wrapper
 */
export interface BulkResult<T> {
  results: T[];
  successCount: number;
  errorCount: number;
}

/**
 * Tool response structure for bulk operations
 * Used for formatting responses with hints
 */
export interface ToolResponse {
  instructions?: string;
  results?: unknown[];
  data?: unknown;
  summary?: {
    total: number;
    hasResults: number;
    empty: number;
    errors: number;
  };
  hasResultsStatusHints?: string[];
  emptyStatusHints?: string[];
  errorStatusHints?: string[];
  [key: string]: unknown;
}
