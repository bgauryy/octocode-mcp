/**
 * Common types shared across all tool implementations
 */

import type { GitHubAPIError } from '../github/githubAPI';
import type { QueryStatus } from '../utils/bulkOperations';

/**
 * Context information for generating hints based on operation results
 */
export interface HintContext {
  resultType: 'hasResults' | 'empty' | 'failed';
  apiError?: GitHubAPIError;
}

/**
 * Organized hints categorized by result type
 */
export interface OrganizedHints {
  hasResults?: string[];
  empty?: string[];
  failed?: string[];
}

/**
 * Base result type returned by all tool processors
 * Includes status, research metadata, and optional hints
 * Extends Record<string, unknown> for compatibility with bulkOperations
 */
export interface ToolResult extends Record<string, unknown> {
  status: QueryStatus;
  researchGoal?: string;
  reasoning?: string;
  researchSuggestions?: string[];
  hints?: string[];
}

/**
 * Error result type with error information
 */
export interface ToolErrorResult extends ToolResult {
  status: 'error';
  error: string | GitHubAPIError;
}

/**
 * Success result type with data
 * Generic type T allows for tool-specific data fields
 */
export interface ToolSuccessResult<T = Record<string, unknown>>
  extends ToolResult {
  status: 'hasResults' | 'empty';
  // Data fields are spread from T when used with createSuccessResult
  data?: T;
}
