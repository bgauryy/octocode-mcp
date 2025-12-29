/**
 * Pagination type definitions
 * Shared interfaces for pagination across local and GitHub tools
 */

/**
 * Pagination metadata returned by applyPagination
 *
 * Contains both byte-based and character-based offsets to support:
 * - Byte offsets: For GitHub API compatibility and binary operations
 * - Character offsets: For JavaScript string operations (substring, slice)
 *
 * IMPORTANT: These are NOT interchangeable for multi-byte UTF-8 content (emojis, CJK, etc.)
 */
export interface PaginationMetadata {
  paginatedContent: string;

  // Byte-based offsets (for GitHub API compatibility, binary operations)
  /** Current byte offset in the content */
  byteOffset: number;
  /** Length of paginated content in bytes */
  byteLength: number;
  /** Total content size in bytes */
  totalBytes: number;
  /** Next byte offset for pagination (undefined if no more content) */
  nextByteOffset?: number;

  // Character-based offsets (for JavaScript string operations)
  /** Current character offset in the content (for use with string.substring) */
  charOffset: number;
  /** Length of paginated content in characters (for use with string.length) */
  charLength: number;
  /** Total content size in characters */
  totalChars: number;
  /** Next character offset for pagination (undefined if no more content) */
  nextCharOffset?: number;

  // Common fields
  hasMore: boolean;
  estimatedTokens?: number;
  currentPage: number;
  totalPages: number;
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
