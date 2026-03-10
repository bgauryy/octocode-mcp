/**
 * Types for local_find_files tool (localFindFiles)
 * @module tools/local_find_files/types
 */

import type {
  LocalFindFilesEntry,
  LocalFindFilesPagination,
  LocalFindFilesToolResult,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for finding local files
 */
export interface FindFilesQuery {
  id?: string;
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

export type FoundFile = LocalFindFilesEntry;

export type FindFilesPagination = LocalFindFilesPagination;

export type FindFilesResult = LocalFindFilesToolResult;
