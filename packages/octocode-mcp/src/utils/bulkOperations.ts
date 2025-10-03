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

export interface ProcessedBulkResult {
  researchGoal?: string;
  reasoning?: string;
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
    if (researchGoal) item.researchGoal = researchGoal;
    if (reasoning) item.reasoning = reasoning;

    errorItems.push(item);
  });

  results.forEach(r => {
    const item = { ...(r.result as Record<string, unknown>) };
    const query = r.originalQuery as Record<string, unknown>;

    if (!item.researchGoal)
      item.researchGoal = safeExtractString(query, 'researchGoal');
    if (!item.reasoning) item.reasoning = safeExtractString(query, 'reasoning');

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

  const data: Record<string, unknown> = {};

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

function safeExtractString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
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
