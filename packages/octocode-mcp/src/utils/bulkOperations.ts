/**
 * Shared bulk operations utilities for consistent patterns across all MCP tools
 *
 * This module provides common functionality for:
 * - Parallel query processing with error isolation
 * - Result aggregation into successful/empty/failed structure
 * - Organized hint generation per query outcome
 *
 * Response structure:
 * data:
 *   queries:
 *     successful: [...] // queries that returned results
 *     empty: [...]      // queries that ran but found no matches
 *     failed: [...]     // queries that encountered errors
 *   hints:
 *     successful: [...] // hints for working with results
 *     empty: [...]      // hints for refining empty queries
 *     failed: [...]     // hints for recovering from errors
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { ToolName, TOOL_NAMES } from '../constants.js';
import { generateHints } from '../tools/hints.js';
import { BULK_OPERATIONS_HINTS } from '../tools/hintsContent.js';
import { executeWithErrorIsolation, PromiseResult } from './promiseUtils.js';
import { createResponseFormat, type ToolResponse } from '../responses.js';

export interface ProcessedBulkResult {
  researchGoal?: string;
  reasoning?: string;
  suggestions?: string[];
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata?: Record<string, unknown>;
}

export interface QueryError {
  queryIndex: number;
  error: string;
}

export interface BulkResponseConfig {
  toolName: ToolName;
  keysPriority?: string[];
}

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
    const suggestions = safeExtractStringArray(originalQuery, 'suggestions');
    if (researchGoal) item.researchGoal = researchGoal;
    if (reasoning) item.reasoning = reasoning;
    if (suggestions) item.suggestions = suggestions;

    errorItems.push(item);
  });

  results.forEach(r => {
    const item = { ...(r.result as Record<string, unknown>) };
    const query = r.originalQuery as Record<string, unknown>;

    if (!item.researchGoal)
      item.researchGoal = safeExtractString(query, 'researchGoal');
    if (!item.reasoning) item.reasoning = safeExtractString(query, 'reasoning');
    if (!item.suggestions)
      item.suggestions = safeExtractStringArray(query, 'suggestions');

    if (item.error) {
      if (!item.metadata) item.metadata = {};
      (item.metadata as Record<string, unknown>).originalQuery = query;
      errorItems.push(item);
    } else if (isNoResultsForTool(config.toolName, item)) {
      if (!item.metadata) item.metadata = {};
      (item.metadata as Record<string, unknown>).originalQuery = query;
      noResultItems.push(item);
    } else {
      delete item.metadata;
      successItems.push(item);
    }
  });

  // Build queries object - only include sections with data
  const queriesData: Record<string, unknown[]> = {};
  const hintsData: Record<string, string[]> = {};

  if (successItems.length > 0) {
    queriesData.successful = successItems;
    const successfulHints = generateHints({
      toolName: config.toolName,
      resultType: 'successful',
    });
    hintsData.successful = successfulHints.successful || [];
  }

  if (noResultItems.length > 0) {
    queriesData.empty = noResultItems;
    const emptyHints = generateHints({
      toolName: config.toolName,
      resultType: 'empty',
    });
    hintsData.empty = emptyHints.empty || [];
  }

  if (errorItems.length > 0) {
    queriesData.failed = errorItems;
    const failedHints = generateHints({
      toolName: config.toolName,
      resultType: 'failed',
      errorMessage: errors[0]?.error || (errorItems[0]?.error as string),
    });
    hintsData.failed = failedHints.failed || [];
  }

  // Build data object - only include if we have queries
  const data: Record<string, unknown> = {};
  if (Object.keys(queriesData).length > 0) {
    data.queries = queriesData;
  }
  if (Object.keys(hintsData).length > 0) {
    data.hints = hintsData;
  }

  const counts = [];
  if (successItems.length > 0) counts.push(`${successItems.length} successful`);
  if (noResultItems.length > 0) counts.push(`${noResultItems.length} empty`);
  if (errorItems.length > 0) counts.push(`${errorItems.length} failed`);

  const responseData: ToolResponse = {
    data,
    hints:
      counts.length > 0
        ? [
            `Query results: ${counts.join(', ')}`,
            BULK_OPERATIONS_HINTS.QUERY_CATEGORY_GUIDANCE,
          ]
        : [BULK_OPERATIONS_HINTS.NO_QUERIES_PROCESSED],
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

function safeExtractString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function safeExtractStringArray(
  obj: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = obj[key];
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return value as string[];
  }
  return undefined;
}

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
