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
import { validateBulkTokenLimit } from './tokenValidation.js';
import { RESPONSE_KEY_PRIORITY } from '../scheme/responsePriority.js';
import { ERROR_CODES, type ErrorCode } from '../errors/errorCodes.js';

/**
 * Base result interface with status field
 */
interface BaseResult {
  status: 'hasResults' | 'empty' | 'error';
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  errorCode?: ErrorCode;
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
 * Clean structure: only status and data (no query echo, no duplicated fields)
 */
interface FlatQueryResult<TResult> {
  status: 'hasResults' | 'empty' | 'error';
  data: TResult;
}

/**
 * Bulk operation response structure
 * Clean structure: no duplicate hints at top level (they're in each result's data)
 */
interface BulkOperationResponse<TResult> {
  results: Array<FlatQueryResult<TResult>>;
  [key: string]: unknown; // Allow additional properties for ToolResponse compatibility
}

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
  const results = await processBulkQueries<TQuery, TResult>(queries, processor);
  return formatBulkResponse<TResult>(results, config);
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

  const promises = queries.map(query => processFn(query));
  const results = await settleAll(promises);

  const finalResults: TResult[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      finalResults.push(result.value);
    } else {
      if (!continueOnError) {
        throw result.reason;
      }

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
  _error: unknown,
  baseData: Partial<T> = {}
): T {
  return {
    ...baseData,
    status: 'error',
    errorCode: ERROR_CODES.QUERY_EXECUTION_FAILED,
  } as T;
}

/**
 * Format bulk query results into an MCP CallToolResult.
 * Internal function used by executeBulkOperation().
 */
function formatBulkResponse<TResult extends BaseResult>(
  results: Array<TResult>,
  config: BulkResponseConfig
): CallToolResult {
  const flatResults: Array<FlatQueryResult<TResult>> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    flatResults.push({
      status: result.status,
      data: result,
    });
  }

  const responseData: BulkOperationResponse<TResult> = {
    results: flatResults,
  };

  const formattedText = createResponseFormat(
    responseData,
    RESPONSE_KEY_PRIORITY
  );

  // CRITICAL: Validate final response size to prevent exceeding MCP 25K token limit
  const validation = validateBulkTokenLimit(
    formattedText,
    config.toolName,
    flatResults.length
  );

  if (!validation.isValid) {
    const errorResponse = {
      errorCode: ERROR_CODES.RESPONSE_TOO_LARGE,
      hints: validation.hints || [],
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: createResponseFormat(errorResponse, ['errorCode', 'hints']),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: formattedText,
      },
    ],
    isError: false,
  };
}

// Note: Removed extractResultData, extractField, and filterQueryFields
// These are no longer needed with the clean structure that keeps all data intact
