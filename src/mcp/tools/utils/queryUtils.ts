/**
 * Shared query utility functions for GitHub tools
 * Eliminates code duplication and provides consistent query handling
 */

/**
 * Ensures unique queryIds across all queries in a batch using efficient single-pass algorithm
 *
 * Performance: O(n) time complexity vs O(n²) worst-case of the previous while-loop approach
 * Memory: Uses Map for counting vs Set + string concatenation in loops
 *
 * @param queries Array of queries that may have duplicate or missing IDs
 * @param defaultPrefix Default prefix for auto-generated IDs (default: "query")
 * @returns Array of queries with guaranteed unique IDs
 */
export function ensureUniqueQueryIds<T extends { id?: string }>(
  queries: T[],
  defaultPrefix: string = 'query'
): (T & { id: string })[] {
  const idCounts = new Map<string, number>();

  return queries.map((query, index) => {
    const baseId = query.id || `${defaultPrefix}_${index + 1}`;
    const count = idCounts.get(baseId) || 0;
    idCounts.set(baseId, count + 1);

    const uniqueId = count === 0 ? baseId : `${baseId}_${count}`;

    return {
      ...query,
      id: uniqueId,
    } as T & { id: string };
  });
}

/**
 * Common pattern for cleaning query parameters by removing null/undefined values
 * Ensures API calls don't receive invalid parameters
 *
 * @param query Query object that may contain null/undefined values
 * @returns Cleaned query object with only valid values
 */
export function cleanQueryParameters<T extends Record<string, any>>(
  query: T
): T {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([_, value]) => value !== null && value !== undefined
    )
  ) as T;
}

/**
 * Standardized error context extraction for consistent error handling
 *
 * @param error Error message or Error object
 * @returns Normalized error information
 */
export interface ErrorContext {
  message: string;
  type:
    | 'rate_limit'
    | 'auth_required'
    | 'not_found'
    | 'access_denied'
    | 'network'
    | 'validation'
    | 'unknown';
  isRetryable: boolean;
}

export function extractErrorContext(error: string | Error): ErrorContext {
  const message = error instanceof Error ? error.message : error;
  const messageLower = message.toLowerCase();

  if (messageLower.includes('rate limit') || messageLower.includes('403')) {
    return {
      message,
      type: 'rate_limit',
      isRetryable: true,
    };
  }

  if (messageLower.includes('auth') || messageLower.includes('unauthorized')) {
    return {
      message,
      type: 'auth_required',
      isRetryable: false,
    };
  }

  if (messageLower.includes('not found') || messageLower.includes('404')) {
    return {
      message,
      type: 'not_found',
      isRetryable: false,
    };
  }

  if (
    messageLower.includes('access denied') ||
    messageLower.includes('forbidden')
  ) {
    return {
      message,
      type: 'access_denied',
      isRetryable: false,
    };
  }

  if (messageLower.includes('timeout') || messageLower.includes('network')) {
    return {
      message,
      type: 'network',
      isRetryable: true,
    };
  }

  if (messageLower.includes('validation') || messageLower.includes('invalid')) {
    return {
      message,
      type: 'validation',
      isRetryable: false,
    };
  }

  return {
    message,
    type: 'unknown',
    isRetryable: false,
  };
}

/**
 * Common aggregation context pattern used across GitHub search tools
 */
export interface BaseAggregatedContext {
  successfulQueries: number;
  failedQueries: number;
  dataQuality: {
    hasResults: boolean;
    hasContent: boolean;
  };
}

/**
 * Initialize base aggregated context with common patterns
 */
export function createBaseAggregatedContext(): BaseAggregatedContext {
  return {
    successfulQueries: 0,
    failedQueries: 0,
    dataQuality: {
      hasResults: false,
      hasContent: false,
    },
  };
}

/**
 * Common pattern for generating research goal-based semantic alternatives
 * Used across different GitHub search tools for consistent suggestion generation
 */
export function getSemanticAlternatives(researchGoal?: string): string[] {
  switch (researchGoal) {
    case 'discovery':
      return [
        'alternative',
        'similar',
        'clone',
        'fork',
        'inspired',
        'based on',
        'like',
      ];

    case 'analysis':
      return [
        'awesome',
        'best',
        'top',
        'popular',
        'trending',
        'recommended',
        'curated',
      ];

    case 'code_generation':
      return [
        'tutorial',
        'guide',
        'example',
        'starter',
        'template',
        'boilerplate',
        'course',
        'learning',
      ];

    case 'debugging':
      return [
        'error handling',
        'exception',
        'try catch',
        'debug',
        'log',
        'test failure',
        'bug fix',
        'regression',
      ];

    case 'code_analysis':
      return [
        'function',
        'method',
        'class',
        'interface',
        'implementation',
        'pattern',
        'architecture',
        'design',
      ];

    default:
      return [
        'implementation',
        'example',
        'tutorial',
        'documentation',
        'guide',
      ];
  }
}

/**
 * Extract repository information from various formats
 * Common utility for parsing repository references
 */
export interface RepositoryInfo {
  owner: string;
  repo: string;
  fullName: string;
}

export function parseRepositoryReference(
  reference: string
): RepositoryInfo | null {
  // Handle full GitHub URLs
  const urlMatch = reference.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      fullName: `${urlMatch[1]}/${urlMatch[2]}`,
    };
  }

  // Handle owner/repo format
  const directMatch = reference.match(/^([^/]+)\/([^/]+)$/);
  if (directMatch) {
    return {
      owner: directMatch[1],
      repo: directMatch[2],
      fullName: reference,
    };
  }

  return null;
}

/**
 * Common pattern for processing failed queries with consistent error handling
 */
export interface FailedQueryResult<T> {
  queryId: string;
  failed: true;
  researchGoal?: string;
  hints: string[];
  meta: {
    queryArgs: T;
    error?: string;
    errorType?: ErrorContext['type'];
    suggestions?: any;
  };
}

export function createFailedQueryResult<T>(
  queryId: string,
  query: T,
  error: string,
  hints: string[],
  suggestions?: any
): FailedQueryResult<T> {
  const errorContext = extractErrorContext(error);

  return {
    queryId,
    failed: true,
    researchGoal: (query as any)?.researchGoal,
    hints,
    meta: {
      queryArgs: { ...query },
      error: errorContext.message,
      errorType: errorContext.type,
      suggestions,
    },
  };
}

/**
 * Common retry strategy based on error type
 */
export interface RetryStrategy {
  shouldRetry: boolean;
  delay: number; // milliseconds
  maxRetries: number;
  backoffMultiplier: number;
}

export function getRetryStrategy(
  errorType: ErrorContext['type']
): RetryStrategy {
  switch (errorType) {
    case 'rate_limit':
      return {
        shouldRetry: true,
        delay: 60000, // 1 minute
        maxRetries: 3,
        backoffMultiplier: 2,
      };

    case 'network':
      return {
        shouldRetry: true,
        delay: 1000, // 1 second
        maxRetries: 2,
        backoffMultiplier: 1.5,
      };

    default:
      return {
        shouldRetry: false,
        delay: 0,
        maxRetries: 0,
        backoffMultiplier: 1,
      };
  }
}
