/**
 * Shared bulk operations utilities for consistent patterns across all MCP tools
 *
 * This module provides common functionality for:
 * - Parallel query processing with error isolation
 * - Result aggregation into results/noResults/errors structure
 * - Organized hint generation per result type
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { ToolName, TOOL_NAMES } from '../constants.js';
import { generateHints } from '../tools/hints.js';
import { executeWithErrorIsolation, PromiseResult } from './promiseUtils.js';
import { createResponseFormat, type ToolResponse } from '../responses.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Base interface for processed results from bulk operations
 */
export interface ProcessedBulkResult {
  researchGoal?: string;
  reasoning?: string;
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Error information for failed queries
 */
export interface QueryError {
  queryIndex: number;
  error: string;
}

/**
 * Configuration for bulk response generation
 */
export interface BulkResponseConfig {
  toolName: ToolName;
  keysPriority?: string[];
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Process bulk queries in parallel with error isolation
 *
 * @param queries Array of queries to process
 * @param processor Function that processes a single query
 * @returns Object containing successful results and errors
 */
export async function processBulkQueries<
  T extends Record<string, unknown>,
  R extends ProcessedBulkResult,
>(
  queries: Array<T>,
  processor: (query: T, index: number) => Promise<R>
): Promise<{
  results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: T;
  }>;
  errors: QueryError[];
}> {
  const results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: T;
  }> = [];
  const errors: QueryError[] = [];

  if (!queries || queries.length === 0) {
    return { results, errors };
  }

  const queryPromiseFunctions = queries.map(
    (query, index) => () =>
      processor(query, index).then(result => ({
        result,
        queryIndex: index,
        originalQuery: query,
      }))
  );

  const queryResults = await executeWithErrorIsolation(queryPromiseFunctions, {
    timeout: 60000,
    continueOnError: true,
    onError: (error: Error, index: number) => {
      errors.push({
        queryIndex: index,
        error: error.message,
      });
    },
  });

  queryResults.forEach(
    (
      result: PromiseResult<{
        result: R;
        queryIndex: number;
        originalQuery: T;
      }>
    ) => {
      if (result.success && result.data) {
        results.push({
          result: result.data.result,
          queryIndex: result.data.queryIndex,
          originalQuery: result.data.originalQuery,
        });
      }
    }
  );

  return { results, errors };
}

/**
 * Create standardized bulk response with results/noResults/errors structure
 *
 * @param config Response configuration
 * @param results Successful query results
 * @param errors Query errors
 * @param queries Original queries
 * @returns Standardized CallToolResult
 */
export function createBulkResponse<
  T extends Record<string, unknown>,
  R extends ProcessedBulkResult,
>(
  config: BulkResponseConfig,
  results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: T;
  }>,
  errors: QueryError[],
  queries: Array<T>
): CallToolResult {
  const successItems: Record<string, unknown>[] = [];
  const noResultItems: Record<string, unknown>[] = [];
  const errorItems: Record<string, unknown>[] = [];

  // Process errors
  errors.forEach(error => {
    const originalQuery = queries[error.queryIndex];
    if (!originalQuery) return;

    const item: Record<string, unknown> = {
      error: error.error,
      metadata: { originalQuery },
    };

    const researchGoal = safeExtractString(originalQuery, 'researchGoal');
    const reasoning = safeExtractString(originalQuery, 'reasoning');
    if (researchGoal) item.researchGoal = researchGoal;
    if (reasoning) item.reasoning = reasoning;

    errorItems.push(item);
  });

  // Process successful results
  results.forEach(r => {
    const item = { ...(r.result as Record<string, unknown>) };
    const query = r.originalQuery as Record<string, unknown>;

    // Propagate researchGoal/reasoning from query if not in result
    if (!item.researchGoal)
      item.researchGoal = safeExtractString(query, 'researchGoal');
    if (!item.reasoning) item.reasoning = safeExtractString(query, 'reasoning');

    if (item.error) {
      // Treat result errors as error items
      if (!item.metadata) item.metadata = {};
      (item.metadata as Record<string, unknown>).originalQuery = query;
      errorItems.push(item);
    } else if (isNoResultsForTool(config.toolName, item)) {
      // No results case
      if (!item.metadata) item.metadata = {};
      (item.metadata as Record<string, unknown>).originalQuery = query;
      noResultItems.push(item);
    } else {
      // Success with data
      delete item.metadata;
      successItems.push(item);
    }
  });

  // Build response data with only non-empty sections
  const data: Record<string, unknown> = {};

  // Add results section if there are successful items
  if (successItems.length > 0) {
    const resultsHints = generateHints({
      toolName: config.toolName,
      resultType: 'results',
    });
    data.results = {
      items: successItems,
      hints: resultsHints.results || [],
    };
  }

  // Add noResults section if there are no-result items
  if (noResultItems.length > 0) {
    const noResultsHints = generateHints({
      toolName: config.toolName,
      resultType: 'noResults',
    });
    data.noResults = {
      items: noResultItems,
      hints: noResultsHints.noResults || [],
    };
  }

  // Add errors section if there are error items
  if (errorItems.length > 0) {
    const errorsHints = generateHints({
      toolName: config.toolName,
      resultType: 'errors',
      errorMessage: errors[0]?.error || (errorItems[0]?.error as string),
    });
    data.errors = {
      items: errorItems,
      hints: errorsHints.errors || [],
    };
  }

  // Build summary hints
  const counts = [];
  if (successItems.length > 0) counts.push(`${successItems.length} results`);
  if (noResultItems.length > 0)
    counts.push(`${noResultItems.length} no-results`);
  if (errorItems.length > 0) counts.push(`${errorItems.length} errors`);

  const responseData: ToolResponse = {
    data,
    hints: [
      counts.join(', '),
      'Check hints in each section for better research strategies',
    ],
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: createResponseFormat(responseData, config.keysPriority),
      },
    ],
    isError: false,
  };
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Helper to safely extract string property from unknown object
 */
function safeExtractString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Determine if a result has no data based on tool-specific logic
 */
function isNoResultsForTool(
  toolName: ToolName,
  resultObj: Record<string, unknown>
): boolean {
  if ('error' in resultObj) return false;

  switch (toolName) {
    case TOOL_NAMES.GITHUB_FETCH_CONTENT:
      return false;
    case TOOL_NAMES.GITHUB_SEARCH_CODE:
      return Array.isArray(resultObj.files) && resultObj.files.length === 0;
    case TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES:
      return (
        Array.isArray(resultObj.repositories) &&
        resultObj.repositories.length === 0
      );
    case TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS:
      return (
        Array.isArray(resultObj.pull_requests) &&
        resultObj.pull_requests.length === 0
      );
    case TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE: {
      const files = resultObj.files as unknown[];
      const folders = resultObj.folders as unknown[];
      return (
        (!files || files.length === 0) && (!folders || folders.length === 0)
      );
    }
    default:
      return false;
  }
}
