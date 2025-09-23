/**
 * Shared bulk operations utilities for consistent patterns across all MCP tools
 *
 * This module provides common functionality for:
 * - Unique ID generation for bulk queries
 * - Parallel query processing
 * - Error aggregation and recovery
 * - Result aggregation and context building
 * - Smart hint generation based on bulk results
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
// Hints are now provided by the consolidated hints system
import { ToolName } from '../constants.js';
import { generateBulkHints, BulkHintContext } from '../tools/hints.js';
import { executeWithErrorIsolation, PromiseResult } from './promiseUtils.js';

/**
 * Smart type constraint - handles schema-inferred types and unknown fields
 */
type HasOptionalId = { id?: string | unknown } & Record<string, unknown>;

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
 * Base interface for processed results from bulk operations
 */
export interface ProcessedBulkResult {
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>;
}

/**
 * Error information for failed queries
 */
export interface QueryError {
  queryId: string;
  error: string;
  recoveryHints?: string[];
}

/**
 * Base aggregated context for bulk operations
 */
export interface AggregatedContext {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  dataQuality: {
    hasResults: boolean;
    [key: string]: unknown;
  };
}

/**
 * Configuration for bulk response generation
 */
export interface BulkResponseConfig {
  toolName: ToolName;
  maxHints?: number;
}

/**
 * Ensure all queries have unique IDs for tracking and error reporting
 * Accepts external IDs from schema, generates fallback IDs only when needed
 *
 * @param queries Array of queries to assign IDs
 * @param defaultPrefix Prefix for generated IDs (default: 'query')
 * @returns Array of queries with unique IDs (preserves external IDs, generates fallbacks)
 */
export function ensureUniqueQueryIds<T extends HasOptionalId>(
  queries: T[],
  defaultPrefix: string = 'query'
): Array<T & { id: string }> {
  const usedIds = new Set<string>();

  return queries.map((query, index) => {
    // First, try to use external ID from schema if provided
    let queryId = safeExtractString(query, 'id');

    // If no external ID or ID already used, generate fallback
    if (!queryId || usedIds.has(queryId)) {
      queryId = `${defaultPrefix}_${index + 1}`;
    }

    usedIds.add(queryId);

    // Create result with preserved or generated ID
    return { ...query, id: queryId };
  });
}

/**
 * Process bulk queries in parallel with error isolation
 * Works with any object type - no rigid constraints needed
 *
 * @param queries Array of queries to process
 * @param processor Function that processes a single query
 * @returns Object containing successful results and errors
 */
export async function processBulkQueries<
  T extends HasOptionalId,
  R extends ProcessedBulkResult,
>(
  queries: Array<T & { id: string }>,
  processor: (query: T & { id: string }) => Promise<R>
): Promise<{
  results: Array<{
    result: R;
    queryId: string;
    originalQuery: T & { id: string };
  }>;
  errors: QueryError[];
}> {
  const results: Array<{
    result: R;
    queryId: string;
    originalQuery: T & { id: string };
  }> = [];
  const errors: QueryError[] = [];

  // Early return for empty queries to avoid unnecessary processing
  if (!queries || queries.length === 0) {
    return { results, errors };
  }

  // Create promise functions for executeWithErrorIsolation (lazy execution)
  const queryPromiseFunctions = queries.map(
    (query, index) => () =>
      processor(query).then(result => ({
        result,
        queryId: query.id,
        index,
        originalQuery: query,
      }))
  );

  // Wait for all queries to complete with error isolation
  const queryResults = await executeWithErrorIsolation(queryPromiseFunctions, {
    timeout: 60000, // 60 second timeout per query
    continueOnError: true,
    onError: (error: Error, index: number) => {
      const query = queries[index];
      errors.push({
        queryId: query?.id || `query-${index}`,
        error: error.message,
      });
    },
  });

  // Collect successful results with proper query tracking
  queryResults.forEach(
    (
      result: PromiseResult<{
        result: R;
        queryId: string;
        index: number;
        originalQuery: T & { id: string };
      }>
    ) => {
      if (result.success && result.data) {
        const data = result.data; // TypeScript now knows data is defined
        results.push({
          result: data.result,
          queryId: data.queryId,
          originalQuery: data.originalQuery,
        });
      }
    }
  );

  return { results, errors };
}

function createBulkHintsContext<T extends HasOptionalId>(
  config: BulkResponseConfig,
  context: AggregatedContext,
  errors: QueryError[],
  _queries: Array<T & { id: string }>
): BulkHintContext {
  return {
    toolName: config.toolName,
    hasResults: context.dataQuality.hasResults,
    errorCount: errors.length,
    totalCount: context.totalQueries,
    successCount: context.successfulQueries,
  };
}

/**
 * Create standardized bulk response with consistent structure
 * Works with any object type - no rigid constraints needed
 *
 * @param config Response configuration
 * @param results Successful query results
 * @param context Aggregated context
 * @param errors Query errors
 * @param queries Original queries
 * @returns Standardized CallToolResult
 */
export function createBulkResponse<
  T extends HasOptionalId,
  R extends ProcessedBulkResult,
>(
  config: BulkResponseConfig,
  results: Array<{
    result: R;
    queryId: string;
    originalQuery: T & { id: string };
  }>,
  context: AggregatedContext,
  errors: QueryError[],
  queries: Array<T & { id: string }>
): CallToolResult {
  // Generate smart hints using consolidated hints system
  const hintContext = createBulkHintsContext(config, context, errors, queries);
  const hints = generateBulkHints(hintContext);

  // Process successful results with proper query mapping
  const processedSuccessResults = results.map(r => {
    const result = { ...r.result } as Record<string, unknown>;
    const query = r.originalQuery;

    // Always add queryId to results
    result.queryId = r.queryId;

    // Preserve reasoning field if it exists in the original result
    if ('reasoning' in r.result && r.result.reasoning) {
      result.reasoning = r.result.reasoning;
    }

    // For no-results cases or errors, always include metadata with query args
    const hasNoResults =
      (!result.data &&
        !result.repositories &&
        !result.files &&
        !result.folders &&
        !result.structure &&
        !result.pull_requests &&
        !result.content) ||
      (result.files as unknown[] | undefined)?.length === 0 ||
      (result.repositories as unknown[] | undefined)?.length === 0 ||
      (result.folders as unknown[] | undefined)?.length === 0 ||
      (result.structure as unknown[] | undefined)?.length === 0 ||
      (result.pull_requests as unknown[] | undefined)?.length === 0;

    const hasError = !!result.error;

    if (hasNoResults || hasError) {
      // Ensure metadata exists and includes query args
      if (!result.metadata || typeof result.metadata !== 'object') {
        result.metadata = {};
      }
      (result.metadata as Record<string, unknown>).queryArgs = { ...query };
    } else if ('metadata' in result) {
      // Remove metadata if has results and no error
      delete result.metadata;
    }

    return result;
  });

  // Process error results to include them in the response
  const processedErrorResults = errors.map(error => {
    // Find the original query for this error
    const originalQuery = queries.find(q => q.id === error.queryId);

    return {
      queryId: error.queryId,
      error: error.error,
      hints: error.recoveryHints || [],
      metadata: {
        queryArgs: originalQuery ? { ...originalQuery } : { id: error.queryId },
      },
    };
  });

  // Combine successful and error results, maintaining query order
  const allResults: Record<string, unknown>[] = [];
  const resultMap = new Map(results.map(r => [r.queryId, r]));
  const errorMap = new Map(errors.map(e => [e.queryId, e]));

  // Process queries in original order to maintain consistency
  queries.forEach(query => {
    const successResult = resultMap.get(query.id);
    const errorResult = errorMap.get(query.id);

    if (successResult) {
      // Find the processed success result
      const processedResult = processedSuccessResults.find(
        pr => pr.queryId === query.id
      );
      if (processedResult) {
        allResults.push(processedResult);
      }
    } else if (errorResult) {
      // Find the processed error result
      const processedError = processedErrorResults.find(
        pe => pe.queryId === query.id
      );
      if (processedError) {
        allResults.push(processedError);
      }
    }
  });

  // Build response object with ToolResponse format: {data: [], hints: []}
  const responseData: Record<string, unknown> = {
    data: allResults,
    hints,
  };

  // Create the result directly with the custom structure
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(responseData, null, 2),
      },
    ],
    isError: false,
  };
}

/**
 * Smart error hint generation based on common error patterns
 *
 * @param error Error message
 * @param context Additional context for hint generation
 * @returns Array of recovery hints
 */
export function generateErrorRecoveryHints(
  error: string,
  context: {
    queryType?: string;
    suggestedAlternatives?: string[];
    networkRelated?: boolean;
  } = {}
): string[] {
  const hints: string[] = [];
  const errorLower = error.toLowerCase();

  // Network/connectivity issues
  if (
    errorLower.includes('network') ||
    errorLower.includes('timeout') ||
    errorLower.includes('enotfound') ||
    context.networkRelated
  ) {
    hints.push('Network error. Check connection and retry');
  }

  // Rate limiting
  else if (errorLower.includes('rate limit') || errorLower.includes('429')) {
    hints.push('Rate limit exceeded. Wait 60 seconds before retrying');
  }

  // Authentication/permission issues
  else if (
    errorLower.includes('auth') ||
    errorLower.includes('401') ||
    errorLower.includes('403') ||
    errorLower.includes('permission')
  ) {
    hints.push(
      'Authentication required. Check your GitHub token configuration'
    );
  }

  // Not found errors
  else if (errorLower.includes('not found') || errorLower.includes('404')) {
    hints.push('Resource not found. Verify spelling and accessibility');
  }

  // Add context-specific alternatives
  if (
    context.suggestedAlternatives &&
    context.suggestedAlternatives.length > 0
  ) {
    hints.push(...context.suggestedAlternatives);
  }

  return hints;
}

/**
 * Build aggregated context from multiple results with common patterns
 *
 * @param results Array of processed results
 * @param contextBuilder Function to extract context from individual results
 * @returns Aggregated context object
 */
export function buildAggregatedContext<
  R extends ProcessedBulkResult,
  C extends AggregatedContext,
>(results: R[], contextBuilder: (results: R[]) => C): C {
  const baseContext = {
    totalQueries: results.length,
    successfulQueries: results.filter(r => !r.error).length,
    failedQueries: results.filter(r => !!r.error).length,
    dataQuality: {
      hasResults: results.some(r => !r.error && r.data),
    },
  };

  // Use custom context builder for tool-specific aggregation
  const customContext = contextBuilder(results);

  // Merge base context with custom context - TypeScript should infer correctly
  const mergedContext: C = {
    ...baseContext,
    ...customContext,
    dataQuality: {
      ...baseContext.dataQuality,
      ...customContext.dataQuality,
    },
  } as C; // This cast is needed because of complex intersection type merging

  return mergedContext;
}

/**
 * Validate bulk query parameters with common patterns
 * Works with any object type - no rigid constraints needed
 *
 * @param queries Array of queries to validate
 * @param validator Function to validate individual queries
 * @returns Validation result with errors
 */
export function validateBulkQueries<T extends HasOptionalId>(
  queries: T[],
  validator: (query: T) => { valid: boolean; error?: string }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check query count
  if (!queries || queries.length === 0) {
    errors.push('No queries provided');
  } else if (queries.length > 10) {
    errors.push('Too many queries (maximum 10 allowed)');
  }

  // Validate individual queries
  queries.forEach((query, index) => {
    const validation = validator(query);
    if (!validation.valid) {
      errors.push(`Query ${index + 1}: ${validation.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Performance metrics for bulk operations
 */
export interface BulkOperationMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageResponseTime?: number;
  totalDataSize?: number;
  cacheHitRate?: number;
}

/**
 * Track performance metrics for bulk operations
 *
 * @param startTime Operation start time
 * @param results Query results
 * @param errors Query errors
 * @returns Performance metrics
 */
export function trackBulkMetrics<R extends ProcessedBulkResult>(
  startTime: number,
  results: Array<{ queryId: string; result: R }>,
  errors: QueryError[]
): BulkOperationMetrics {
  const endTime = Date.now();
  const totalQueries = results.length + errors.length;

  return {
    totalQueries,
    successfulQueries: results.length,
    failedQueries: errors.length,
    averageResponseTime:
      totalQueries > 0 ? (endTime - startTime) / totalQueries : 0,
  };
}
