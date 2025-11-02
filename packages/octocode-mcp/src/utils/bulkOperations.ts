/**
 * Bulk Operations Utility
 *
 * This module provides utilities for processing and formatting bulk query operations.
 *
 * ## Public API
 * - `executeBulkOperation()` - Primary function for tools to process bulk queries
 * - `QueryStatus` - Type for query status ('hasResults' | 'empty' | 'error')
 *
 * @module bulkOperations
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeWithErrorIsolation } from './promiseUtils.js';
import { createResponseFormat } from '../responses.js';
import { getGenericErrorHints, getToolHints } from '../tools/hints.js';
import type {
  ProcessedBulkResult,
  FlatQueryResult,
  QueryError,
  BulkResponseConfig,
  ToolResponse,
  PromiseResult,
} from '../types.js';

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Execute bulk queries and format the response in a single operation.
 *
 * @param queries - Array of query objects to process
 * @param processor - Async function that processes each query, must return object with status field
 * @param config - Configuration for response formatting (toolName, keysPriority)
 * @returns Formatted MCP CallToolResult ready to send to client
 *
 * @example
 * return executeBulkOperation(queries, async (query) => {
 *   const result = await searchGitHubCodeAPI(query);
 *   return { status: 'hasResults', data: result };
 * }, {
 *   toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
 *   keysPriority: ['files', 'error']
 * });
 */
export async function executeBulkOperation<
  TQuery extends object,
  TData = Record<string, unknown>,
  R extends ProcessedBulkResult<TData, TQuery> = ProcessedBulkResult<
    TData,
    TQuery
  >,
>(
  queries: Array<TQuery>,
  processor: (query: TQuery, index: number) => Promise<R>,
  config: BulkResponseConfig
): Promise<CallToolResult> {
  const { results, errors } = await processBulkQueries<TQuery, TData, R>(
    queries,
    processor
  );
  return createBulkResponse<TQuery, TData, R>(config, results, errors, queries);
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Format bulk query results into an MCP CallToolResult.
 * Internal function used by executeBulkOperation().
 */
function createBulkResponse<
  TQuery extends object,
  TData = Record<string, unknown>,
  R extends ProcessedBulkResult<TData, TQuery> = ProcessedBulkResult<
    TData,
    TQuery
  >,
>(
  config: BulkResponseConfig,
  results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: TQuery;
  }>,
  errors: QueryError[],
  queries: Array<TQuery>
): CallToolResult {
  const topLevelFields = [
    'instructions',
    'results',
    'hasResultsStatusHints',
    'emptyStatusHints',
    'errorStatusHints',
  ];
  const resultFields = [
    'query',
    'status',
    'data',
    'mainResearchGoal',
    'researchGoal',
    'reasoning',
  ];
  const standardFields = [...topLevelFields, ...resultFields, 'owner', 'repo'];
  const fullKeysPriority = [
    ...new Set([...standardFields, ...(config.keysPriority || [])]),
  ];

  const flatQueries: FlatQueryResult<TQuery>[] = [];

  let hasResultsCount = 0;
  let emptyCount = 0;
  let errorCount = 0;

  // Collect statuses and hints from all results
  let hasAnyHasResults = false;
  let hasAnyEmpty = false;
  let hasAnyError = false;
  const hasResultsHintsSet = new Set<string>();
  const emptyHintsSet = new Set<string>();
  const errorHintsSet = new Set<string>();

  results.forEach(r => {
    // Use status directly from tool result
    const status = r.result.status;
    const toolData = extractToolData(r.result);

    // Track status types and collect any custom hints from results
    const hintsArray = r.result.hints;
    if (status === 'hasResults') {
      hasAnyHasResults = true;
      if (hintsArray && Array.isArray(hintsArray)) {
        hintsArray.forEach(hint => hasResultsHintsSet.add(hint));
      }
    } else if (status === 'empty') {
      hasAnyEmpty = true;
      if (hintsArray && Array.isArray(hintsArray)) {
        hintsArray.forEach(hint => emptyHintsSet.add(hint));
      }
    } else if (status === 'error') {
      hasAnyError = true;
      if (hintsArray && Array.isArray(hintsArray)) {
        hintsArray.forEach(hint => errorHintsSet.add(hint));
      }
    }

    const flatQuery: FlatQueryResult<TQuery> = {
      query: r.originalQuery,
      status,
      data:
        status === 'error' && r.result.error
          ? { error: r.result.error }
          : toolData,
      researchGoal:
        r.result.researchGoal ||
        safeExtractString(r.originalQuery, 'researchGoal'),
      reasoning:
        r.result.reasoning || safeExtractString(r.originalQuery, 'reasoning'),
    };

    flatQueries.push(flatQuery);

    if (status === 'hasResults') hasResultsCount++;
    else if (status === 'empty') emptyCount++;
    else errorCount++;
  });

  errors.forEach(err => {
    const originalQuery = queries[err.queryIndex];
    if (!originalQuery) return;

    hasAnyError = true;

    flatQueries.push({
      query: originalQuery,
      status: 'error',
      data: { error: err.error },
      researchGoal: safeExtractString(originalQuery, 'researchGoal'),
      reasoning: safeExtractString(originalQuery, 'reasoning'),
    });

    errorCount++;
  });

  // Generate hints: prefer custom hints from results, fall back to tool-based hints
  const hasResultsHints = hasAnyHasResults
    ? hasResultsHintsSet.size > 0
      ? [...hasResultsHintsSet]
      : [
          ...getToolHints(
            config.toolName as Parameters<typeof getToolHints>[0],
            'hasResults'
          ),
        ]
    : [];

  const emptyHints = hasAnyEmpty
    ? emptyHintsSet.size > 0
      ? [...emptyHintsSet]
      : [
          ...getToolHints(
            config.toolName as Parameters<typeof getToolHints>[0],
            'empty'
          ),
        ]
    : [];

  // For errors: use custom hints if available, otherwise generic hints
  const errorHints = hasAnyError
    ? errorHintsSet.size > 0
      ? [...errorHintsSet]
      : [...getGenericErrorHints()]
    : [];

  const counts = [];
  if (hasResultsCount > 0) counts.push(`${hasResultsCount} hasResults`);
  if (emptyCount > 0) counts.push(`${emptyCount} empty`);
  if (errorCount > 0) counts.push(`${errorCount} failed`);

  // Generate instructions string
  const instructionsParts = [
    `Bulk response with ${flatQueries.length} results: ${counts.join(', ')}.`,
    'Each result includes the original query, status, and data.',
  ];
  if (hasResultsCount > 0) {
    instructionsParts.push(
      'Review hasResultsStatusHints for guidance on results with data.'
    );
  }
  if (emptyCount > 0) {
    instructionsParts.push('Review emptyStatusHints for no-results scenarios.');
  }
  if (errorCount > 0) {
    instructionsParts.push(
      'Review errorStatusHints for error recovery strategies.'
    );
  }
  const instructions = instructionsParts.join('\n');

  const responseData: ToolResponse = {
    instructions,
    results: flatQueries,
    hasResultsStatusHints: hasResultsHints,
    emptyStatusHints: emptyHints,
    errorStatusHints: errorHints,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: createResponseFormat(responseData, fullKeysPriority),
      },
    ],
    isError: false,
  };
}

/**
 * Process multiple queries in parallel with error isolation.
 * Internal function used by executeBulkOperation().
 *
 * @param queries - Array of query objects to process
 * @param processor - Async function that processes each query
 * @returns Object containing successful results and errors
 */
async function processBulkQueries<
  TQuery extends object,
  TData = Record<string, unknown>,
  R extends ProcessedBulkResult<TData, TQuery> = ProcessedBulkResult<
    TData,
    TQuery
  >,
>(
  queries: Array<TQuery>,
  processor: (query: TQuery, index: number) => Promise<R>
): Promise<{
  results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: TQuery;
  }>;
  errors: QueryError[];
}> {
  const results: Array<{
    result: R;
    queryIndex: number;
    originalQuery: TQuery;
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
        originalQuery: TQuery;
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

function extractToolData<TData = Record<string, unknown>, TQuery = object>(
  result: ProcessedBulkResult<TData, TQuery>
): Record<string, unknown> {
  const excludedKeys = new Set([
    'researchGoal',
    'reasoning',
    'error',
    'status',
    'query',
    'hints',
  ]);

  const toolData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (!excludedKeys.has(key)) {
      toolData[key] = value;
    }
  }

  return toolData;
}

function safeExtractString<T extends object>(
  obj: T,
  key: string
): string | undefined {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
