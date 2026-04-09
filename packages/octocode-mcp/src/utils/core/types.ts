/**
 * Core type definitions for local-explorer-mcp MCP server
 * Local/internal types only — all core types imported directly from @octocodeai/octocode-core
 */

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  maxOutputSize?: number;
  toolName?: string;
}

/**
 * Pagination information for all tools
 * Supports both character-based and entity-based pagination
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;

  charOffset?: number;
  charLength?: number;
  totalChars?: number;

  filesPerPage?: number;
  totalFiles?: number;
  entriesPerPage?: number;
  totalEntries?: number;
  matchesPerPage?: number;
  totalMatches?: number;
}

export interface SearchStats {
  matchCount?: number;
  matchedLines?: number;
  filesMatched?: number;
  filesSearched?: number;
  bytesSearched?: number;
  searchTime?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  totalKeys: number;
  lastReset: Date;
}
