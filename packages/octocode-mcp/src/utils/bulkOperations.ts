/**
 * Shared bulk operations utilities for consistent patterns across all MCP tools
 *
 * This module provides common functionality for:
 * - Unique ID generation for bulk queries
 * - Parallel query processing
 * - Error aggregation and recovery
 * - Result aggregation and context building
 * - Smart hint generation based on bulk results
 * - Reasoning propagation from queries to results
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types';
// Hints are now provided by the consolidated hints system
import { ToolName, TOOL_NAMES } from '../constants.js';
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

// Tool-aware, code-based empty detection aligned with our GitHub API wrappers
function getNestedField(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return (obj as Record<string, unknown>)[key];
  const data = (obj as Record<string, unknown>)['data'];
  if (
    data &&
    typeof data === 'object' &&
    key in (data as Record<string, unknown>)
  ) {
    return (data as Record<string, unknown>)[key];
  }
  return undefined;
}

function isNoResultsForTool(
  toolName: ToolName,
  resultObj: Record<string, unknown>
): boolean {
  // If error flag present on a "success" object, treat as no-results path
  if ('error' in resultObj) return true;

  switch (toolName) {
    case TOOL_NAMES.GITHUB_FETCH_CONTENT: {
      // Our API returns explicit error for empty file; success implies content available
      return false;
    }
    case TOOL_NAMES.GITHUB_SEARCH_CODE: {
      const total = getNestedField(resultObj, 'totalCount');
      const files = getNestedField(resultObj, 'files');
      if (typeof total === 'number') return total === 0;
      if (Array.isArray(files)) return files.length === 0;
      return false;
    }
    case TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES: {
      const total = getNestedField(resultObj, 'total_count');
      const repos = getNestedField(resultObj, 'repositories');
      if (typeof total === 'number') return total === 0;
      if (Array.isArray(repos)) return repos.length === 0;
      return false;
    }
    case TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS: {
      const total = getNestedField(resultObj, 'total_count');
      const prs = getNestedField(resultObj, 'pull_requests');
      if (typeof total === 'number') return total === 0;
      if (Array.isArray(prs)) return prs.length === 0;
      return false;
    }
    case TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE: {
      const files = getNestedField(resultObj, 'files');
      const folders = getNestedField(resultObj, 'folders');
      const filesEmpty = Array.isArray(files) ? files.length === 0 : false;
      const foldersEmpty = Array.isArray(folders)
        ? folders.length === 0
        : false;
      return filesEmpty && foldersEmpty;
    }
    default:
      return false;
  }
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

  // Process successful results with proper query mapping (build map for O(1) access later)
  const processedSuccessMap = new Map<string, Record<string, unknown>>();
  results.forEach(r => {
    const merged = { ...(r.result as Record<string, unknown>) } as Record<
      string,
      unknown
    >;
    const query = r.originalQuery;

    // Always add queryId to results
    merged.queryId = r.queryId;

    // Prefer result reasoning when defined, otherwise use query reasoning (including empty strings)
    const resultReasoning = (r.result as Record<string, unknown>).reasoning as
      | string
      | undefined;
    const queryReasoning = safeExtractString(query, 'reasoning');
    if (resultReasoning !== undefined) {
      merged.reasoning = resultReasoning;
    } else if (queryReasoning !== undefined) {
      merged.reasoning = queryReasoning;
    }

    // Add originalQuery metadata for no-results or errors, remove metadata for successful results
    const hasNoResults = isNoResultsForTool(config.toolName, merged);
    const hasError = !!merged.error;

    if (hasNoResults || hasError) {
      if (!merged.metadata || typeof merged.metadata !== 'object') {
        merged.metadata = {};
      }
      (merged.metadata as Record<string, unknown>).originalQuery = { ...query };
    } else {
      // Remove metadata for successful results with content
      delete merged.metadata;
    }

    processedSuccessMap.set(r.queryId, merged);
  });

  // Process error results to include them in the response (build map)
  const processedErrorMap = new Map<string, Record<string, unknown>>();
  errors.forEach(error => {
    const originalQuery = queries.find(q => q.id === error.queryId);
    const queryReasoning = originalQuery
      ? safeExtractString(originalQuery, 'reasoning')
      : undefined;

    const errorResult: Record<string, unknown> = {
      queryId: error.queryId,
      error: error.error,
      hints: error.recoveryHints || [],
      metadata: {
        originalQuery: originalQuery
          ? { ...originalQuery }
          : { id: error.queryId },
      },
    };

    if (queryReasoning !== undefined) {
      errorResult.reasoning = queryReasoning;
    }

    processedErrorMap.set(error.queryId, errorResult);
  });

  // Combine successful and error results, maintaining query order
  const allResults: Record<string, unknown>[] = [];
  // Process queries in original order to maintain consistency
  queries.forEach(query => {
    const successProcessed = processedSuccessMap.get(query.id);
    if (successProcessed) {
      allResults.push(successProcessed);
      return;
    }
    const errorProcessed = processedErrorMap.get(query.id);
    if (errorProcessed) {
      allResults.push(errorProcessed);
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
