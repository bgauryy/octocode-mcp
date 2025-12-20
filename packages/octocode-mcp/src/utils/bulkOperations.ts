import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeWithErrorIsolation } from './promiseUtils.js';
import { createResponseFormat } from '../responses.js';
import {
  getGenericErrorHintsSync,
  getToolHintsSync,
} from '../tools/toolMetadata.js';
import type {
  ProcessedBulkResult,
  FlatQueryResult,
  QueryError,
  BulkResponseConfig,
  ToolResponse,
  PromiseResult,
} from '../types.js';

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
    'id',
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

  const flatQueries: FlatQueryResult[] = [];

  let hasResultsCount = 0;
  let emptyCount = 0;
  let errorCount = 0;

  let hasAnyHasResults = false;
  let hasAnyEmpty = false;
  let hasAnyError = false;
  const hasResultsHintsSet = new Set<string>();
  const emptyHintsSet = new Set<string>();
  const errorHintsSet = new Set<string>();

  results.forEach(r => {
    const status = r.result.status;
    const toolData = extractToolData(r.result);

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
    const flatQuery: FlatQueryResult = {
      id: r.queryIndex + 1,
      status,
      data:
        status === 'error' && r.result.error
          ? { error: r.result.error }
          : toolData,
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

    // Optimized: Query params not duplicated in error results either
    flatQueries.push({
      id: err.queryIndex + 1, // 1-based ID for LLM readability
      status: 'error',
      data: { error: err.error },
    });

    errorCount++;
  });

  const hasResultsHints = hasAnyHasResults
    ? hasResultsHintsSet.size > 0
      ? [...hasResultsHintsSet]
      : [...getToolHintsSync(config.toolName, 'hasResults')]
    : [];

  const emptyHints = hasAnyEmpty
    ? emptyHintsSet.size > 0
      ? [...emptyHintsSet]
      : [...getToolHintsSync(config.toolName, 'empty')]
    : [];

  const errorHints = hasAnyError
    ? errorHintsSet.size > 0
      ? [...errorHintsSet]
      : [...getGenericErrorHintsSync()]
    : [];

  const instructions = generateBulkInstructions(
    flatQueries.length,
    hasResultsCount,
    emptyCount,
    errorCount
  );

  // Optimized: Only include non-empty hint arrays to reduce payload size
  const responseData: ToolResponse = {
    instructions,
    results: flatQueries,
    ...(hasResultsHints.length > 0 && {
      hasResultsStatusHints: hasResultsHints,
    }),
    ...(emptyHints.length > 0 && { emptyStatusHints: emptyHints }),
    ...(errorHints.length > 0 && { errorStatusHints: errorHints }),
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
    concurrency: 3, // Limit concurrent requests to prevent rate limiting
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
    'mainResearchGoal',
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

function generateBulkInstructions(
  total: number,
  hasResultsCount: number,
  emptyCount: number,
  errorCount: number
): string {
  // Optimized: Shortened instructions to reduce payload size
  const counts = [];
  if (hasResultsCount > 0) counts.push(`${hasResultsCount} ok`);
  if (emptyCount > 0) counts.push(`${emptyCount} empty`);
  if (errorCount > 0) counts.push(`${errorCount} error`);

  return `${total} results: ${counts.join(', ')}`;
}
