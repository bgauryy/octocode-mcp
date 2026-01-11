/**
 * Types for local_find_files tool (localFindFiles)
 * @module tools/local_find_files/types
 */

import type { LocalToolErrorCode as ErrorCode } from '../../errorCodes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for finding local files
 */
export interface FindFilesQuery {
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
  filesPerPage?: number;
  filePageNumber?: number;
  charOffset?: number;
  charLength?: number;
  showFileLastModified?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Found file entry
 */
export interface FoundFile {
  path: string;
  type: string;
  size?: number;
  modified?: string;
  permissions?: string;
}

/**
 * Pagination information for find files results
 */
export interface FindFilesPagination {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  filesPerPage?: number;
  totalFiles?: number;
}

/**
 * Result of finding local files
 */
export interface FindFilesResult {
  status: 'hasResults' | 'empty' | 'error';
  files?: FoundFile[];
  cwd?: string;
  totalFiles?: number;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  pagination?: FindFilesPagination;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  [key: string]: unknown;
}
