/**
 * Core type definitions for octocode-local-files MCP server
 */

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
 * Search content query parameters
 */
export interface SearchContentQuery extends BaseQuery {
  pattern: string;
  path: string;
  include?: string[];
  exclude?: string[];
  excludeDir?: string[];
  regex?: boolean;
  perlRegex?: boolean;
  fixedString?: boolean;
  caseInsensitive?: boolean;
  smartCase?: boolean;
  wholeWord?: boolean;
  invertMatch?: boolean;
  binaryFiles?: 'text' | 'without-match' | 'binary';
  followSymlinks?: boolean;
  contextLines?: number;
  beforeLines?: number;
  afterLines?: number;
  lineNumbers?: boolean;
  filesOnly?: boolean;
  filesWithoutMatch?: boolean;
  count?: boolean;
  maxCount?: number;
  limit?: number;
}

/**
 * Search content match result
 */
export interface SearchMatch {
  file: string;
  lineNumber?: number;
  context?: string;
  matchCount?: number;
}

/**
 * Search content result
 */
export interface SearchContentResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  matches?: SearchMatch[];
  totalMatches?: number;
  searchPath?: string;
  error?: string;
  hints?: readonly string[];
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
  treeView?: boolean;
  limit?: number;
  summary?: boolean;
}

/**
 * Directory entry
 */
export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  humanSize?: string;
  modified?: string;
  permissions?: string;
  extension?: string;
}

/**
 * View structure result
 */
export interface ViewStructureResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  entries?: DirectoryEntry[];
  totalFiles?: number;
  totalDirectories?: number;
  totalSize?: number;
  error?: string;
  hints?: readonly string[];
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
  containsPattern?: string;
  excludeDir?: string[];
  limit?: number;
  details?: boolean;
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
  error?: string;
  hints?: readonly string[];
}

/**
 * Fetch content query parameters
 */
export interface FetchContentQuery extends BaseQuery {
  path: string;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  minified?: boolean;
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
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  minified?: boolean;
  minificationFailed?: boolean;
  error?: string;
  hints?: readonly string[];
}

/**
 * View binary query parameters
 */
export interface ViewBinaryQuery extends BaseQuery {
  path: string;
  operation:
    | 'identify'
    | 'strings'
    | 'strings-utf16le'
    | 'hexdump'
    | 'magic-bytes'
    | 'list-archive'
    | 'extract-file'
    | 'full-inspection';
  minLength?: number;
  maxBytes?: number;
  hexLines?: number;
  includeOffsets?: boolean;
  maxFiles?: number;
  archiveFile?: string;
}

/**
 * View binary result
 */
export interface ViewBinaryResult extends BaseQuery {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  operation?: string;
  fileType?: string;
  magicBytes?: string;
  strings?: string[];
  hexDump?: string;
  archiveContents?: {
    entries: Array<{
      size: number;
      date: string;
      time: string;
      name: string;
    }>;
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    truncated: boolean;
  };
  archiveFile?: string;
  extractedContent?: string;
  contentLength?: number;
  fullInspection?: {
    fileType: string;
    magicBytes: string;
    asciiStrings: string[];
    utf16leStrings: string[];
    hexPreview: string;
    archiveContents?: {
      entries: Array<{
        size: number;
        date: string;
        time: string;
        name: string;
      }>;
      totalFiles: number;
      totalDirectories: number;
      totalSize: number;
      truncated: boolean;
    };
  };
  stringCount?: number;
  error?: string;
  hints?: readonly string[];
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
