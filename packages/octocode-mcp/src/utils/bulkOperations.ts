import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { ToolName, TOOL_NAMES } from '../constants.js';
import { generateHints, OrganizedHints } from '../tools/hints.js';
import { executeWithErrorIsolation, PromiseResult } from './promiseUtils.js';
import { createResponseFormat, type ToolResponse } from '../responses.js';

export type QueryStatus = 'hasResults' | 'empty' | 'error';

export interface ProcessedBulkResult {
  researchGoal?: string;
  reasoning?: string;
  researchSuggestions?: string[];
  data?: unknown;
  error?: string;
  status?: QueryStatus;
  hints?: string[];
  query?: Record<string, unknown>;
}

export interface FlatQueryResult {
  query: Record<string, unknown>;
  status: QueryStatus;
  data: Record<string, unknown>;
  researchGoal?: string;
  reasoning?: string;
  researchSuggestions?: string[];
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
    'researchGoal',
    'reasoning',
    'researchSuggestions',
  ];
  const standardFields = [...topLevelFields, ...resultFields, 'owner', 'repo'];
  const fullKeysPriority = [
    ...new Set([...standardFields, ...(config.keysPriority || [])]),
  ];

  const flatQueries: FlatQueryResult[] = [];

  let hasResultsCount = 0;
  let emptyCount = 0;
  let errorCount = 0;

  // Collect hints by status for deduplication
  const hasResultsHintsSet = new Set<string>();
  const emptyHintsSet = new Set<string>();
  const errorHintsSet = new Set<string>();

  results.forEach(r => {
    const status = determineQueryStatus(config.toolName, r.result);
    const toolData = extractToolData(r.result);

    const queryHints = generateHints({
      toolName: config.toolName,
      resultType:
        status === 'hasResults'
          ? 'hasResults'
          : status === 'empty'
            ? 'empty'
            : 'failed',
      errorMessage: r.result.error,
    });

    // Collect hints for deduplication
    const hintsForStatus = extractHintsForStatus(queryHints, status);
    if (status === 'hasResults') {
      hintsForStatus.forEach(hint => hasResultsHintsSet.add(hint));
    } else if (status === 'empty') {
      hintsForStatus.forEach(hint => emptyHintsSet.add(hint));
    } else {
      hintsForStatus.forEach(hint => errorHintsSet.add(hint));
    }

    const flatQuery: FlatQueryResult = {
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
      researchSuggestions: mergeResearchSuggestions(r.result, r.originalQuery),
    };

    flatQueries.push(flatQuery);

    if (status === 'hasResults') hasResultsCount++;
    else if (status === 'empty') emptyCount++;
    else errorCount++;
  });

  errors.forEach(err => {
    const originalQuery = queries[err.queryIndex];
    if (!originalQuery) return;

    const errorHints = generateHints({
      toolName: config.toolName,
      resultType: 'failed',
      errorMessage: err.error,
    });

    // Collect error hints for deduplication
    const hintsForError = errorHints.failed || [];
    hintsForError.forEach(hint => errorHintsSet.add(hint));

    flatQueries.push({
      query: originalQuery,
      status: 'error',
      data: { error: err.error },
      researchGoal: safeExtractString(originalQuery, 'researchGoal'),
      reasoning: safeExtractString(originalQuery, 'reasoning'),
      researchSuggestions: safeExtractStringArray(
        originalQuery,
        'researchSuggestions'
      ),
    });

    errorCount++;
  });

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
    hasResultsStatusHints: [...hasResultsHintsSet],
    emptyStatusHints: [...emptyHintsSet],
    errorStatusHints: [...errorHintsSet],
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

function determineQueryStatus(
  toolName: ToolName,
  result: ProcessedBulkResult
): QueryStatus {
  if (result.error) return 'error';
  if (isNoResultsForTool(toolName, result as Record<string, unknown>)) {
    return 'empty';
  }
  return 'hasResults';
}

function extractToolData(result: ProcessedBulkResult): Record<string, unknown> {
  const resultObj = result as Record<string, unknown>;
  const excludedKeys = new Set([
    'researchGoal',
    'reasoning',
    'researchSuggestions',
    'error',
    'hints',
    'status',
    'query',
  ]);

  const toolData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resultObj)) {
    if (!excludedKeys.has(key)) {
      toolData[key] = value;
    }
  }

  return toolData;
}

function extractHintsForStatus(
  hints: OrganizedHints,
  status: QueryStatus
): string[] {
  if (status === 'hasResults') return hints.hasResults || [];
  if (status === 'empty') return hints.empty || [];
  return hints.failed || [];
}

function mergeResearchSuggestions(
  result: ProcessedBulkResult,
  query: Record<string, unknown>
): string[] | undefined {
  const itemSuggestions = safeExtractStringArray(
    result as Record<string, unknown>,
    'researchSuggestions'
  );
  const querySuggestions = safeExtractStringArray(query, 'researchSuggestions');

  if (itemSuggestions || querySuggestions) {
    const merged = [...(itemSuggestions || []), ...(querySuggestions || [])];
    if (merged.length > 0) {
      return merged;
    }
  }
  return undefined;
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
