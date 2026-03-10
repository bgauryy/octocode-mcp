/**
 * Types for local_ripgrep tool (localSearchCode)
 * @module tools/local_ripgrep/types
 */

import type {
  LocalSearchCodeFile,
  LocalSearchCodeMatch,
  LocalSearchCodeMatchPagination,
  LocalSearchCodePagination,
  LocalSearchCodeToolResult,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for local code search via ripgrep
 */
export interface RipgrepSearchQuery {
  id?: string;
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

export type RipgrepMatch = LocalSearchCodeMatch;

export type RipgrepMatchPagination = LocalSearchCodeMatchPagination;

export type RipgrepFileMatches = LocalSearchCodeFile;

export type SearchContentPagination = LocalSearchCodePagination;

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

export type SearchContentResult = LocalSearchCodeToolResult;
