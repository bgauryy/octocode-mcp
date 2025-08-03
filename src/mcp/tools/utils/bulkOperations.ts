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
import { createResult } from '../../responses';
import { getResearchGoalHints } from './toolRelationships';
import { ToolName, TOOL_NAMES } from './toolConstants';
import type { APIResponseMetadata } from '../../../types/github';

/**
 * Base interface for bulk query operations
 */
export interface BulkQuery {
  id?: string;
  researchGoal?: string;
}

/**
 * Base interface for processed results from bulk operations
 */
export interface ProcessedBulkResult {
  queryId: string;
  data?: unknown;
  error?: string;
  hints?: string[];
  metadata: APIResponseMetadata;
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
 *
 * @param queries Array of queries that may have duplicate or missing IDs
 * @returns Array of queries with guaranteed unique IDs
 */
export function ensureUniqueQueryIds<T extends BulkQuery>(queries: T[]): T[] {
  const usedIds = new Map<string, number>();

  return queries.map((query, index) => {
    let id = query.id || `query_${index + 1}`;

    // Handle duplicate IDs using Map-based counting
    if (usedIds.has(id)) {
      const count = usedIds.get(id)! + 1;
      usedIds.set(id, count);
      id = `${id}_${count}`;
    } else {
      usedIds.set(id, 1);
    }

    return { ...query, id };
  });
}

/**
 * Process bulk queries in parallel with error isolation
 *
 * @param queries Array of queries to process
 * @param processor Function that processes a single query
 * @returns Object containing successful results and errors
 */
export async function processBulkQueries<
  T extends BulkQuery,
  R extends ProcessedBulkResult,
>(
  queries: T[],
  processor: (query: T) => Promise<R>
): Promise<{
  results: Array<{ queryId: string; result: R }>;
  errors: QueryError[];
}> {
  const results: Array<{ queryId: string; result: R }> = [];
  const errors: QueryError[] = [];

  // Process queries in parallel with error isolation
  const queryPromises = queries.map(async query => {
    try {
      const result = await processor(query);
      return { queryId: query.id!, result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        queryId: query.id!,
        error: errorMsg,
      });
      return null;
    }
  });

  // Wait for all queries to complete
  const queryResults = await Promise.allSettled(queryPromises);

  // Collect successful results
  queryResults.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  });

  return { results, errors };
}

/**
 * Generate smart, context-aware hints for bulk operations
 *
 * @param config Configuration for hint generation
 * @param context Aggregated context from bulk operation
 * @param errors Array of errors from failed queries
 * @param queries Original queries for research goal extraction
 * @returns Array of smart hints for LLM guidance
 */
export function generateBulkHints<
  T extends BulkQuery,
  R extends ProcessedBulkResult,
>(
  config: BulkResponseConfig,
  context: AggregatedContext,
  errors: QueryError[],
  queries: T[],
  results?: Array<{ queryId: string; result: R }>
): string[] {
  const hints: string[] = [];
  const { toolName, maxHints = 8 } = config;
  const hasResults = context.dataQuality.hasResults;

  // Error handling hints (highest priority)
  if (errors.length > 0) {
    const failedQueryIds = errors.map(e => e.queryId).join(', ');
    hints.push(
      `Some queries failed (${failedQueryIds}). Check individual query hints for solutions.`
    );

    // Add specific recovery hints from first error
    const firstError = errors[0];
    if (firstError.recoveryHints && firstError.recoveryHints.length > 0) {
      hints.push(...firstError.recoveryHints.slice(0, 2));
    }
  }

  // Success-based hints with detailed query status
  if (hasResults) {
    // Multi-query insights with specific status
    if (context.totalQueries > 1) {
      const failedCount = context.failedQueries + errors.length;

      // Identify queries with no results (successful but empty)
      const noResultsQueries: string[] = [];
      if (results) {
        results.forEach(({ queryId, result }) => {
          if (!result.error && result.metadata?.searchType === 'no_results') {
            noResultsQueries.push(queryId);
          }
        });
      }

      if (failedCount > 0 || noResultsQueries.length > 0) {
        let statusMessage = `Found results in ${context.successfulQueries - noResultsQueries.length} of ${context.totalQueries} queries.`;
        if (noResultsQueries.length > 0) {
          statusMessage += ` Queries with no results: ${noResultsQueries.join(', ')}.`;
        }
        statusMessage += ' Compare successful findings to identify patterns.';
        hints.push(statusMessage);
      } else {
        hints.push(
          `Found results across all ${context.successfulQueries} queries. Compare findings to identify patterns and comprehensive insights.`
        );
      }
    }

    // Enhanced next research steps with tool-specific recommendations
    if (toolName === TOOL_NAMES.GITHUB_SEARCH_CODE) {
      hints.push(
        'Recommended: Fetch relevant file content using github_fetch_content for detailed context, or explore project structure with github_view_repo_structure.'
      );
    } else {
      hints.push(
        'Next: Examine detailed results to understand implementations, patterns, and architectural decisions.'
      );
    }
  } else if (errors.length === 0) {
    // No results, no errors
    hints.push(
      'No results found. Try broader search terms, different keywords, or alternative research approaches.'
    );
  }

  // Research goal specific hints
  const primaryResearchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  if (primaryResearchGoal && hasResults) {
    const goalHints = getResearchGoalHints(toolName, primaryResearchGoal);
    if (goalHints.length > 0) {
      hints.push(...goalHints.slice(0, 2)); // Limit goal-specific hints
    }
  }

  // Trim to max hints to avoid overwhelming LLM
  return hints.slice(0, maxHints);
}

/**
 * Create standardized bulk response with consistent structure
 *
 * @param config Response configuration
 * @param results Successful query results
 * @param context Aggregated context
 * @param errors Query errors
 * @param queries Original queries
 * @returns Standardized CallToolResult
 */
export function createBulkResponse<
  T extends BulkQuery,
  R extends ProcessedBulkResult,
>(
  config: BulkResponseConfig,
  results: Array<{ queryId: string; result: R }>,
  context: AggregatedContext,
  errors: QueryError[],
  queries: T[]
): CallToolResult {
  // Generate smart hints
  const hints = generateBulkHints(config, context, errors, queries, results);

  // Build standardized response with {data, meta, hints} format
  const data = results.map(r => r.result);

  // Extract common researchGoal from queries for LLM context
  const researchGoals = queries
    .map(q => q.researchGoal)
    .filter((goal): goal is string => !!goal);
  const commonResearchGoal =
    researchGoals.length > 0 ? researchGoals[0] : undefined;

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

  // Include errors if requested and present
  if (config.includeErrors && errors.length > 0) {
    meta.errors = errors;
  }

  return createResult({
    data: { data, meta, hints },
  });
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
    hints.push(
      'Network connectivity issue. Check internet connection and service status.',
      'Try again in a few moments or use fewer concurrent queries.'
    );
  }

  // Rate limiting
  else if (errorLower.includes('rate limit') || errorLower.includes('429')) {
    hints.push(
      'Rate limit exceeded. Wait a few minutes before retrying.',
      'Use more specific search terms to reduce API load.'
    );
  }

  // Authentication/permission issues
  else if (
    errorLower.includes('auth') ||
    errorLower.includes('401') ||
    errorLower.includes('403') ||
    errorLower.includes('permission')
  ) {
    hints.push(
      'Authentication or permission issue. Verify credentials and access rights.',
      'Try with public/accessible resources or check authentication status.'
    );
  }

  // Not found errors
  else if (errorLower.includes('not found') || errorLower.includes('404')) {
    hints.push(
      'Resource not found. Verify names, paths, or identifiers are correct.',
      'Try broader search terms or check for alternative naming conventions.'
    );
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

  // Merge base context with custom context
  return {
    ...baseContext,
    ...customContext,
    dataQuality: {
      ...baseContext.dataQuality,
      ...customContext.dataQuality,
    },
  } as C;
}

/**
 * Validate bulk query parameters with common patterns
 *
 * @param queries Array of queries to validate
 * @param validator Function to validate individual queries
 * @returns Validation result with errors
 */
export function validateBulkQueries<T extends BulkQuery>(
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
