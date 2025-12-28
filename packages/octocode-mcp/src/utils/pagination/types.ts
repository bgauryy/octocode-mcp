/**
 * Pagination type definitions
 * Shared interfaces for pagination across local and GitHub tools
 */

/**
 * Pagination metadata returned by applyPagination
 */
export interface PaginationMetadata {
  paginatedContent: string;
  charOffset: number;
  charLength: number;
  totalChars: number;
  hasMore: boolean;
  nextCharOffset?: number;
  estimatedTokens?: number;
  currentPage: number;
  totalPages: number;
  actualOffset?: number;
  actualLength?: number;
}

/**
 * Options for applyPagination
 */
export interface ApplyPaginationOptions {
  actualOffset?: number;
  /**
   * Whether charOffset and charLength are character offsets (default) or byte offsets
   * - 'characters': Treat offsets as character positions (for local tools)
   * - 'bytes': Treat offsets as byte positions (for GitHub API compatibility)
   */
  mode?: 'characters' | 'bytes';
}

/**
 * Options for generatePaginationHints (generic)
 */
export interface GeneratePaginationHintsOptions {
  enableWarnings?: boolean;
  customHints?: string[];
  toolName?: string;
}

/**
 * Context for GitHub file content pagination hints
 */
export interface GitHubFileContentHintContext {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

/**
 * Pagination info for GitHub repository structure
 */
export interface StructurePaginationInfo {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  entriesPerPage: number;
  totalEntries: number;
}

/**
 * Context for GitHub repository structure pagination hints
 */
export interface StructurePaginationHintContext {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  pageFiles: number;
  pageFolders: number;
  allFiles: number;
  allFolders: number;
}

/**
 * Result from sliceByCharRespectLines
 */
export interface SliceByCharResult {
  sliced: string;
  actualOffset: number;
  actualLength: number;
  hasMore: boolean;
  nextOffset?: number;
  lineCount: number;
  totalChars: number;
}
