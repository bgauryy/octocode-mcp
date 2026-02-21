/**
 * Types for local_view_structure tool (localViewStructure)
 * @module tools/local_view_structure/types
 */

import type { LocalToolErrorCode as ErrorCode } from '../../errorCodes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for viewing local directory structure
 */
export interface ViewStructureQuery {
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
  entriesPerPage?: number;
  entryPageNumber?: number;
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
 * Pagination information for view structure results
 */
export interface ViewStructurePagination {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  entriesPerPage?: number;
  totalEntries?: number;
}

/**
 * Result of viewing local directory structure
 */
export interface ViewStructureResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  cwd?: string;
  entries?: Array<{
    name: string;
    type: 'file' | 'dir' | 'link';
    size?: string;
    modified?: string;
    permissions?: string;
  }>;
  summary?: string;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  warnings?: string[];
  pagination?: ViewStructurePagination;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  [key: string]: unknown;
}
