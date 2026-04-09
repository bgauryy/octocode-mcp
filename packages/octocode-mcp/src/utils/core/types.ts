/**
 * Core type definitions for local-explorer-mcp MCP server
 */

import type {
  LocalFindFilesEntry,
  LocalFindFilesToolResult,
  LocalGetFileContentToolResult,
  LocalSearchCodeFile,
  LocalSearchCodeMatch,
  LocalSearchCodeToolResult,
  LocalViewStructureToolResult,
} from '@octocodeai/octocode-core';

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
 * Base query schema fields (inherited from octocode-mcp)
 */
export interface BaseQuery {
  id?: string;
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

export type SearchContentResult = LocalSearchCodeToolResult;

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

export type RipgrepMatch = LocalSearchCodeMatch;

export type RipgrepFileMatches = LocalSearchCodeFile;

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

export type ViewStructureResult = LocalViewStructureToolResult;

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

export type FoundFile = LocalFindFilesEntry;

export type FindFilesResult = LocalFindFilesToolResult;

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

export type FetchContentResult = LocalGetFileContentToolResult;

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
