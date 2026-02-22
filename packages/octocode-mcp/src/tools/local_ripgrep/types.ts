/**
 * Types for local_ripgrep tool (localSearchCode)
 * @module tools/local_ripgrep/types
 */

import type { LocalToolErrorCode as ErrorCode } from '../../errorCodes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for local code search via ripgrep
 */
export interface RipgrepSearchQuery {
  pattern: string;
  path: string;
  mode?: 'discovery' | 'paginated' | 'detailed';
  fixedString?: boolean;
  perlRegex?: boolean;
  smartCase?: boolean;
  caseInsensitive?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  invertMatch?: boolean;
  type?: string;
  include?: string[];
  exclude?: string[];
  excludeDir?: string[];
  noIgnore?: boolean;
  hidden?: boolean;
  followSymlinks?: boolean;
  filesOnly?: boolean;
  filesWithoutMatch?: boolean;
  count?: boolean;
  countMatches?: boolean;
  contextLines?: number;
  beforeContext?: number;
  afterContext?: number;
  lineNumbers?: boolean;
  column?: boolean;
  maxFiles?: number;
  maxMatchesPerFile?: number;
  matchContentLength?: number;
  filesPerPage?: number;
  filePageNumber?: number;
  matchesPerPage?: number;
  includeStats?: boolean;
  includeDistribution?: boolean;
  showFileLastModified?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Single match within a file
 */
export interface RipgrepMatch {
  value: string;
  line: number;
  column?: number;
}

/**
 * Pagination for matches within a file
 */
export interface RipgrepMatchPagination {
  currentPage: number;
  totalPages: number;
  matchesPerPage: number;
  totalMatches: number;
  hasMore: boolean;
}

/**
 * File with its matches grouped together
 */
export interface RipgrepFileMatches {
  path: string;
  matchCount: number;
  matches: RipgrepMatch[];
  modified?: string;
  pagination?: RipgrepMatchPagination;
}

/**
 * File-level pagination
 */
export interface SearchContentPagination {
  currentPage: number;
  totalPages: number;
  filesPerPage: number;
  totalFiles: number;
  hasMore: boolean;
}

/**
 * Search statistics
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
 * Result of local code search
 */
export interface SearchContentResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  warnings?: string[];
  files?: RipgrepFileMatches[];
  pagination?: SearchContentPagination;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  [key: string]: unknown;
}
