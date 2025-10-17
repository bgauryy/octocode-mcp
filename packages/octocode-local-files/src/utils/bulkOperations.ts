/**
 * Bulk Operations Utility for Local File Tools
 *
 * This module provides utilities for processing and formatting bulk query operations
 * for local file system tools. It follows the pattern established in octocode-mcp
 * but simplified for local operations.
 *
 * ## Public API
 * - `executeBulkOperation()` - Primary function for tools to process bulk queries
 * - `processBulkQueries()` - Lower-level parallel query processor
 * - `createErrorResult()` - Helper for creating error results
 *
 * @module bulkOperations
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { settleAll } from './promiseUtils.js';
import { createResponseFormat } from './responses.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Base result interface with status field
 */
interface BaseResult {
  status: 'hasResults' | 'empty' | 'error';
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: readonly string[];
}

/**
 * Configuration for bulk response formatting
 */
interface BulkResponseConfig {
  toolName: string;
}

/**
 * Flat query result structure for response
 */
interface FlatQueryResult<TQuery, TResult> {
  query: TQuery;
  status: 'hasResults' | 'empty' | 'error';
  data: Omit<TResult, 'researchGoal' | 'reasoning'>;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * Bulk operation response structure
 */
interface BulkOperationResponse<TQuery, TResult> {
  instructions: string;
  results: Array<FlatQueryResult<TQuery, TResult>>;
  summary: {
    total: number;
    hasResults: number;
    empty: number;
    errors: number;
  };
  hasResultsStatusHints?: string[];
  emptyStatusHints?: string[];
  errorStatusHints?: string[];
  [key: string]: unknown; // Allow additional properties for ToolResponse compatibility
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Execute bulk queries and format the response in a single operation.
 * This is the primary function that tools should use.
 *
 * @param queries - Array of query objects to process
 * @param processor - Async function that processes each query
 * @param config - Configuration for response formatting (toolName)
 * @returns Formatted MCP CallToolResult ready to send to client
 *
 * @example
 * return executeBulkOperation(
 *   queries,
 *   searchContent,
 *   { toolName: TOOL_NAMES.LOCAL_SEARCH_CONTENT }
 * );
 */
export async function executeBulkOperation<
  TQuery extends object,
  TResult extends BaseResult,
>(
  queries: Array<TQuery>,
  processor: (query: TQuery) => Promise<TResult>,
  config: BulkResponseConfig
): Promise<CallToolResult> {
  // Process all queries in parallel
  const results = await processBulkQueries<TQuery, TResult>(queries, processor);

  // Format response
  return formatBulkResponse<TQuery, TResult>(queries, results, config);
}

/**
 * Processes multiple queries in parallel with error isolation.
 * Lower-level function - prefer using executeBulkOperation() instead.
 *
 * @param queries - Array of query objects to process
 * @param processFn - Async function that processes each query
 * @param options - Optional configuration for error handling
 * @returns Array of results (including error results)
 */
export async function processBulkQueries<TQuery, TResult extends BaseResult>(
  queries: TQuery[],
  processFn: (query: TQuery) => Promise<TResult>,
  options: {
    concurrency?: number;
    continueOnError?: boolean;
  } = {}
): Promise<TResult[]> {
  const { continueOnError = true } = options;

  // Execute all queries in parallel
  const promises = queries.map((query) => processFn(query));
  const results = await settleAll(promises);

  // Process results
  const finalResults: TResult[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      finalResults.push(result.value);
    } else {
      if (!continueOnError) {
        throw result.reason;
      }

      // Create error result from failed promise
      const errorResult = createErrorResult<TResult>(
        result.reason,
        queries[index] as Partial<TResult>
      );
      finalResults.push(errorResult);
    }
  }

  return finalResults;
}

/**
 * Creates an error result for failed queries.
 * Helper function for manual error handling.
 *
 * @param error - Error object or message
 * @param baseData - Base data to include in the error result (like query fields)
 * @returns Error result object
 */
export function createErrorResult<T extends BaseResult>(
  error: unknown,
  baseData: Partial<T> = {}
): T {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    ...baseData,
    status: 'error',
    error: errorMessage,
  } as T;
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Format bulk query results into an MCP CallToolResult.
 * Internal function used by executeBulkOperation().
 */
function formatBulkResponse<TQuery extends object, TResult extends BaseResult>(
  queries: Array<TQuery>,
  results: Array<TResult>,
  config: BulkResponseConfig
): CallToolResult {
  // Count status types
  let hasResultsCount = 0;
  let emptyCount = 0;
  let errorCount = 0;

  // Collect hints by status
  const hasResultsHints = new Set<string>();
  const emptyHints = new Set<string>();
  const errorHints = new Set<string>();

  // Create flat query results
  const flatResults: Array<FlatQueryResult<TQuery, TResult>> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const query = queries[i];

    // Extract research context
    const researchGoal =
      result.researchGoal || extractField(query, 'researchGoal');
    const reasoning = result.reasoning || extractField(query, 'reasoning');

    // Extract data (everything except status, researchGoal, reasoning, error)
    const data = extractResultData(result);

    // Create flat result
    flatResults.push({
      query,
      status: result.status,
      data: data as Omit<TResult, 'researchGoal' | 'reasoning'>,
      researchGoal,
      reasoning,
    });

    // Count statuses and collect hints
    if (result.status === 'hasResults') {
      hasResultsCount++;
      if (result.hints && Array.isArray(result.hints)) {
        result.hints.forEach((hint) => hasResultsHints.add(hint));
      }
    } else if (result.status === 'empty') {
      emptyCount++;
      if (result.hints && Array.isArray(result.hints)) {
        result.hints.forEach((hint) => emptyHints.add(hint));
      }
    } else if (result.status === 'error') {
      errorCount++;
      if (result.hints && Array.isArray(result.hints)) {
        result.hints.forEach((hint) => errorHints.add(hint));
      }
    }
  }

  // Build instructions
  const counts = [];
  if (hasResultsCount > 0) counts.push(`${hasResultsCount} with results`);
  if (emptyCount > 0) counts.push(`${emptyCount} empty`);
  if (errorCount > 0) counts.push(`${errorCount} failed`);

  const instructions = [
    `Bulk response from ${config.toolName} with ${flatResults.length} queries: ${counts.join(', ')}.`,
    'Each result includes the original query, status, and data.',
    hasResultsCount > 0
      ? 'Review results with status="hasResults" for found data.'
      : null,
    emptyCount > 0
      ? 'Review results with status="empty" for no-match scenarios.'
      : null,
    errorCount > 0 ? 'Review results with status="error" for failures.' : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Create response structure
  const responseData: BulkOperationResponse<TQuery, TResult> = {
    instructions,
    results: flatResults,
    summary: {
      total: flatResults.length,
      hasResults: hasResultsCount,
      empty: emptyCount,
      errors: errorCount,
    },
    ...(hasResultsHints.size > 0
      ? { hasResultsStatusHints: [...hasResultsHints] }
      : {}),
    ...(emptyHints.size > 0 ? { emptyStatusHints: [...emptyHints] } : {}),
    ...(errorHints.size > 0 ? { errorStatusHints: [...errorHints] } : {}),
  };

  // Format response using octocode-utils for YAML conversion
  // Priority ordering: instructions first, then results, then hints
  return {
    content: [
      {
        type: 'text' as const,
        text: createResponseFormat(responseData, [
          'instructions',
          'results',
          'summary',
          'hasResultsStatusHints',
          'emptyStatusHints',
          'errorStatusHints',
          'query',
          'status',
          'data',
          'researchGoal',
          'reasoning',
        ]),
      },
    ],
    isError: false,
  };
}

/**
 * Extract data fields from result, excluding metadata fields
 */
function extractResultData<TResult extends BaseResult>(
  result: TResult
): Partial<TResult> {
  const excludedKeys = new Set(['status', 'researchGoal', 'reasoning']);
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    if (!excludedKeys.has(key)) {
      data[key] = value;
    }
  }

  return data as Partial<TResult>;
}

/**
 * Safely extract a field from an object as a string
 */
function extractField<T extends object>(
  obj: T,
  key: string
): string | undefined {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
