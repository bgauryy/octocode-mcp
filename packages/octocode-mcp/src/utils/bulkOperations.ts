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
  includeAggregatedContext?: boolean;
  includeErrors?: boolean;
  maxHints?: number;
}

/**
 * Ensure unique query IDs for bulk operations using efficient O(n) algorithm
 * Works with any object that has optional id field - no rigid type constraints
 *
 * @param queries Array of queries that may have duplicate or missing IDs
 * @returns Array of queries with guaranteed unique IDs
 */
export function ensureUniqueQueryIds<T extends HasOptionalId>(
  queries: T[],
  defaultPrefix: string = 'query'
): Array<T & { id: string }> {
  const idCounts = new Map<string, number>();

  return queries.map((query, index) => {
    // Safely extract id field, handling unknown types from schema inference
    const baseId =
      safeExtractString(query, 'id') || `${defaultPrefix}_${index + 1}`;
    const count = idCounts.get(baseId) || 0;
    idCounts.set(baseId, count + 1);

    const uniqueId = count === 0 ? baseId : `${baseId}_${count}`;

    // Create result with properly typed id field
    return { ...query, id: uniqueId };
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
  results: Array<{ result: R }>;
  errors: QueryError[];
}> {
  const results: Array<{ result: R }> = [];
  const errors: QueryError[] = [];

  // Process queries in parallel with error isolation
  const queryPromises = queries.map(async (query, index) => {
    try {
      const result = await processor(query);
      return { result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        queryId: `query-${index}`,
        error: errorMsg,
      });
      return null;
    }
  });

  // Wait for all queries to complete with error isolation
  const queryResults = await executeWithErrorIsolation(
    queryPromises.map(promise => () => promise),
    {
      timeout: 60000, // 60 second timeout per query
      continueOnError: true,
      onError: (error: Error, index: number) => {
        errors.push({
          queryId: `query-${index}`,
          error: error.message,
        });
      },
    }
  );

  // Collect successful results
  queryResults.forEach((result: PromiseResult<{ result: R } | null>) => {
    if (result.success && result.data) {
      results.push(result.data);
    }
  });

  return { results, errors };
}

/**
 * Generate a query description from query parameters
 *
 * @param query The query object to generate description for
 * @returns Generated description or undefined
 */
function generateQueryDescription(
  query: Record<string, unknown>
): string | undefined {
  const parts: string[] = [];

  // Repository context
  const owner = safeExtractString(query, 'owner');
  const repo = safeExtractString(query, 'repo');
  if (owner && repo) {
    parts.push(`${owner}/${repo}`);
  } else if (owner) {
    parts.push(`owner:${owner}`);
  }

  // Search terms or path
  const queryTerms = query.queryTerms as string[] | undefined;
  const path = safeExtractString(query, 'path');
  if (queryTerms && queryTerms.length > 0) {
    parts.push(`search: ${queryTerms.join(', ')}`);
  } else if (path) {
    parts.push(`path: ${path}`);
  }

  // Language filter
  const language = safeExtractString(query, 'language');
  if (language) {
    parts.push(`language:${language}`);
  }

  return parts.length > 0 ? parts.join(' - ') : undefined;
}

/**
 * Create bulk hints context for the consolidated hints system
 * Works with any object type - extracts researchGoal safely
 */
function createBulkHintsContext<T extends HasOptionalId>(
  config: BulkResponseConfig,
  context: AggregatedContext,
  errors: QueryError[],
  queries: Array<T & { id: string }>
): BulkHintContext {
  // Extract common researchGoal from queries - safely handle any object type
  const researchGoals = queries
    .map(q => safeExtractString(q, 'researchGoal'))
    .filter((goal): goal is string => !!goal);
  const commonResearchGoal =
    researchGoals.length > 0 ? researchGoals[0] : undefined;

  return {
    toolName: config.toolName,
    hasResults: context.dataQuality.hasResults,
    errorCount: errors.length,
    totalCount: context.totalQueries,
    successCount: context.successfulQueries,
    researchGoal: commonResearchGoal,
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
 * @param verbose Whether to include verbose metadata
 * @returns Standardized CallToolResult
 */
export function createBulkResponse<
  T extends HasOptionalId,
  R extends ProcessedBulkResult,
>(
  config: BulkResponseConfig,
  results: Array<{ result: R }>,
  context: AggregatedContext,
  errors: QueryError[],
  queries: Array<T & { id: string }>,
  verbose: boolean = false
): CallToolResult {
  // Generate smart hints using consolidated hints system
  const hintContext = createBulkHintsContext(config, context, errors, queries);
  const hints = generateBulkHints(hintContext);

  // Process results to match new format requirements
  const processedResults = results.map((r, index) => {
    const result = { ...r.result } as Record<string, unknown>;

    // Remove metadata if not verbose
    if (!verbose && 'metadata' in result) {
      delete result.metadata;
    }

    // Add queryDescription to top layer - use LLM-provided description from schema or generate one
    const query = queries[index]; // Use index since we don't have queryId anymore
    if (query) {
      // First try to use LLM-provided description from schema
      let queryDescription = safeExtractString(query, 'queryDescription');

      // If not provided, generate one from query parameters
      if (!queryDescription) {
        queryDescription = generateQueryDescription(query);
      }

      if (queryDescription) {
        result.queryDescription = queryDescription;
      }
    }

    // For repository structure tool, add summary and queryArgs to top level if verbose
    if (verbose && config.toolName === TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE) {
      const metadata = result.metadata as Record<string, unknown> | undefined;
      if (metadata?.summary) {
        result.summary = metadata.summary;
      }
      if (metadata?.queryArgs) {
        result.queryArgs = metadata.queryArgs;
      }
    }

    return result;
  });

  // Extract common researchGoal from queries for LLM context - safely handle any object type
  const researchGoals = queries
    .map(q => safeExtractString(q, 'researchGoal'))
    .filter((goal): goal is string => !!goal);
  const commonResearchGoal =
    researchGoals.length > 0 ? researchGoals[0] : undefined;

  // Build response object with consistent format: {results: [], hints: [], meta: []}
  const responseData: Record<string, unknown> = {
    results: processedResults,
    hints,
  };

  // Only include meta if verbose is true
  if (verbose) {
    const meta: Record<string, unknown> = {
      totalOperations: results.length,
      successfulOperations: results.filter(r => !r.result.error).length,
      failedOperations: results.filter(r => !!r.result.error).length,
      ...(commonResearchGoal && { researchGoal: commonResearchGoal }),
    };

    // Include aggregated context if requested
    if (config.includeAggregatedContext) {
      meta.aggregatedContext = context;
    }

    // Include errors if requested
    if (config.includeErrors) {
      meta.errors = errors;
    }

    responseData.meta = meta;
  }

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
