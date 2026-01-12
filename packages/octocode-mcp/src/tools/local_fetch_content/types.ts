/**
 * Types for local_fetch_content tool (localGetFileContent)
 * @module tools/local_fetch_content/types
 */

import type { LocalToolErrorCode as ErrorCode } from '../../errorCodes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for fetching local file content
 */
export interface FetchContentQuery {
  path: string;
  fullContent?: boolean;
  matchString?: string;
  matchStringContextLines?: number;
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;
  startLine?: number;
  endLine?: number;
  charOffset?: number;
  charLength?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Pagination information for content results
 */
export interface FetchContentPagination {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  charOffset?: number;
  charLength?: number;
  totalChars?: number;
}

/**
 * Result of fetching local file content
 */
export interface FetchContentResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  cwd?: string;
  content?: string;
  contentLength?: number;
  isPartial?: boolean;
  totalLines?: number;
  minificationFailed?: boolean;
  errorCode?: ErrorCode;
  hints?: readonly string[];
  warnings?: string[];
  startLine?: number;
  endLine?: number;
  extractedLines?: number;
  matchRanges?: Array<{ start: number; end: number }>;
  pagination?: FetchContentPagination;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  [key: string]: unknown;
}
