/**
 * Types for github_fetch_content tool (githubGetFileContent)
 * @module tools/github_fetch_content/types
 */

import type { PaginationInfo } from '../../utils/core/types.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for fetching GitHub file content
 */
export interface FileContentQuery {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  charOffset?: number;
  charLength?: number;
  noTimestamp?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/** LLM sampling metadata for content operations */
export interface SamplingInfo {
  samplingId?: string;
  samplingMethod?: string;
  samplingTokens?: number;
  samplingCost?: number;
  [key: string]: unknown;
}

/** File content result data */
export interface ContentResultData {
  owner?: string;
  repo?: string;
  path?: string;
  contentLength?: number;
  content?: string;
  branch?: string;
  startLine?: number;
  endLine?: number;
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?: string;
  originalQuery?: FileContentQuery;
  matchLocations?: string[];
  sampling?: SamplingInfo;
  lastModified?: string;
  lastModifiedBy?: string;
  pagination?: PaginationInfo;
  /** True when matchString was provided but not found in file (not an error, just no match) */
  matchNotFound?: boolean;
  /** The matchString that was searched for (when matchNotFound is true) */
  searchedFor?: string;
}

/** Base result interface */
interface BaseToolResult<TQuery = object> {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

/** Complete file content result */
export interface ContentResult
  extends BaseToolResult<FileContentQuery>, ContentResultData {}
