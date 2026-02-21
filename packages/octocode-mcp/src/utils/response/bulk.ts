import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeWithErrorIsolation } from '../core/promise.js';
import { createResponseFormat } from '../../responses.js';
import { applyOutputSizeLimit } from '../pagination/index.js';
import type {
  ProcessedBulkResult,
  FlatQueryResult,
  QueryError,
  BulkResponseConfig,
  ToolResponse,
  PromiseResult,
} from '../../types.js';

/** Default concurrency for bulk operations */
const DEFAULT_BULK_CONCURRENCY = 3;

/** Timeout for bulk query execution, configurable via environment variable */
const BULK_QUERY_TIMEOUT_MS =
  parseInt(process.env.OCTOCODE_BULK_QUERY_TIMEOUT_MS || '60000', 10) || 60000;

export async function executeBulkOperation<TQuery extends object>(
  queries: Array<TQuery>,
  processor: (query: TQuery, index: number) => Promise<ProcessedBulkResult>,
  config: BulkResponseConfig
): Promise<CallToolResult> {
  const { results, errors } = await processBulkQueries<TQuery>(
    queries,
    processor,
    config.concurrency ?? DEFAULT_BULK_CONCURRENCY
  );
  return createBulkResponse<TQuery>(config, results, errors, queries);
}

function createBulkResponse<TQuery extends object>(
  config: BulkResponseConfig,
  results: Array<{
    result: ProcessedBulkResult;
    queryIndex: number;
    originalQuery: TQuery;
  }>,
  errors: QueryError[],
  queries: Array<TQuery>
): CallToolResult {
  const topLevelFields = ['instructions', 'results'];
  const resultFields = [
    'id',
    'status',
    'data',
    'mainResearchGoal',
    'researchGoal',
    'reasoning',
    'hints',
  ];
  const standardFields = [...topLevelFields, ...resultFields, 'owner', 'repo'];
  const fullKeysPriority = [
    ...new Set([...standardFields, ...(config.keysPriority || [])]),
  ];

  const flatQueries: FlatQueryResult[] = [];

  let hasResultsCount = 0;
  let emptyCount = 0;
  let errorCount = 0;

  results.forEach(r => {
    const status = r.result.status;
    const toolData = extractToolData(r.result);

    const flatQuery: FlatQueryResult = {
      id: r.queryIndex + 1, // 1-based ID for LLM readability
      status,
      data:
        status === 'error' && r.result.error
          ? (() => {
              const filtered = filterHints(r.result.hints);
              return {
                error: r.result.error,
                ...(filtered ? { hints: filtered } : {}),
              };
            })()
          : toolData,
      mainResearchGoal:
        r.result.mainResearchGoal ||
        safeExtractString(r.originalQuery, 'mainResearchGoal'),
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

    flatQueries.push({
      id: err.queryIndex + 1, // 1-based ID for LLM readability
      status: 'error',
      data: { error: err.error },
      mainResearchGoal: safeExtractString(originalQuery, 'mainResearchGoal'),
      researchGoal: safeExtractString(originalQuery, 'researchGoal'),
      reasoning: safeExtractString(originalQuery, 'reasoning'),
    });

    errorCount++;
  });

  const instructions = generateBulkInstructions(
    flatQueries.length,
    hasResultsCount,
    emptyCount,
    errorCount
  );

  const responseData: ToolResponse = {
    instructions,
    results: flatQueries,
  };

  let text = createResponseFormat(responseData, fullKeysPriority);

  const sizeLimitResult = applyOutputSizeLimit(text, {});
  if (sizeLimitResult.wasLimited) {
    const paginationSuffix = [
      ...sizeLimitResult.warnings,
      ...sizeLimitResult.paginationHints,
    ]
      .filter(s => s.length > 0)
      .join('\n');
    text =
      sizeLimitResult.content +
      (paginationSuffix ? '\n' + paginationSuffix : '');
  }

  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    isError: errorCount > 0 && hasResultsCount === 0 && emptyCount === 0,
  };
}

/**
 * Process multiple queries in parallel with error isolation.
 * Internal function used by executeBulkOperation().
 *
 * @param queries - Array of query objects to process
 * @param processor - Async function that processes each query
 * @param concurrency - Maximum number of concurrent operations
 * @returns Object containing successful results and errors
 */
async function processBulkQueries<TQuery extends object>(
  queries: Array<TQuery>,
  processor: (query: TQuery, index: number) => Promise<ProcessedBulkResult>,
  concurrency: number
): Promise<{
  results: Array<{
    result: ProcessedBulkResult;
    queryIndex: number;
    originalQuery: TQuery;
  }>;
  errors: QueryError[];
}> {
  const results: Array<{
    result: ProcessedBulkResult;
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
    timeout: BULK_QUERY_TIMEOUT_MS,
    continueOnError: true,
    concurrency, // Configurable concurrent requests to balance rate limiting vs throughput
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
        result: ProcessedBulkResult;
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

function filterHints(hints: unknown): string[] | undefined {
  if (!Array.isArray(hints)) return undefined;
  const filtered = hints.filter(
    (h): h is string => typeof h === 'string' && h.trim().length > 0
  );
  return filtered.length > 0 ? filtered : undefined;
}

function extractToolData(result: ProcessedBulkResult): Record<string, unknown> {
  const excludedKeys = new Set([
    'mainResearchGoal',
    'researchGoal',
    'reasoning',
    'error',
    'status',
    'query',
  ]);

  const toolData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (!excludedKeys.has(key)) {
      if (key === 'hints') {
        const filtered = filterHints(value);
        if (filtered) toolData[key] = filtered;
      } else {
        toolData[key] = value;
      }
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

function generateBulkInstructions(
  total: number,
  hasResultsCount: number,
  emptyCount: number,
  errorCount: number
): string {
  if (total === 0) return '0 results.';
  const parts = [];
  if (hasResultsCount > 0) parts.push(`${hasResultsCount} data`);
  if (emptyCount > 0) parts.push(`${emptyCount} empty`);
  if (errorCount > 0) parts.push(`${errorCount} error`);
  if (total === 1) {
    return parts.length === 1 && hasResultsCount === 1
      ? '1 result.'
      : `1 result: ${parts.join(', ')}.`;
  }
  return `${total} results: ${parts.join(', ')}.`;
}
