import { RequestError } from 'octokit';
import type { GitHubAPIError } from './githubAPI';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  STATUS_TO_ERROR_CODE,
  NETWORK_ERROR_PATTERNS,
  RATE_LIMIT_PATTERNS,
  RATE_LIMIT_CONFIG,
  type ErrorCode,
} from './errorConstants.js';

/**
 * Enhanced error handling for GitHub API
 * Provides detailed error information with scope suggestions and proper typing
 * Uses centralized error constants for maintainability
 */
export function handleGitHubAPIError(error: unknown): GitHubAPIError {
  // Handle Octokit RequestError
  if (error instanceof RequestError) {
    return handleRequestError(error);
  }

  // Handle standard JavaScript errors
  if (error instanceof Error) {
    return handleJavaScriptError(error);
  }

  // Handle unknown error types (strings, null, undefined, objects)
  return {
    error:
      typeof error === 'string'
        ? error
        : ERROR_MESSAGES[ERROR_CODES.UNKNOWN].message,
    type: 'unknown',
  };
}

/**
 * Handle Octokit RequestError objects
 */
function handleRequestError(error: RequestError): GitHubAPIError {
  const { status, message, response } = error;

  // Handle 403 errors (most complex - rate limits and permissions)
  if (status === 403) {
    return handle403Error(message, response);
  }

  // Handle other HTTP status codes
  const errorCode = STATUS_TO_ERROR_CODE[status];
  if (errorCode) {
    return handleKnownHttpError(errorCode, status);
  }

  // Handle unknown HTTP status codes
  return createErrorResponse(ERROR_CODES.UNKNOWN, {
    error: message || ERROR_MESSAGES[ERROR_CODES.UNKNOWN].message,
    status,
  });
}

/**
 * Handle 403 Forbidden errors
 * These can be: primary rate limit, secondary rate limit, or permission issues
 */
function handle403Error(
  message: string,
  response?: RequestError['response']
): GitHubAPIError {
  const headers = response?.headers;

  // Check for secondary rate limit FIRST (per @octokit/plugin-throttling pattern)
  if (RATE_LIMIT_PATTERNS.SECONDARY.test(message)) {
    return handleSecondaryRateLimit(headers);
  }

  // Check for primary rate limit (REST + GraphQL)
  const remaining = headers?.['x-ratelimit-remaining'];
  const isGraphQLRateLimited = checkGraphQLRateLimit(response);

  if (remaining === '0' || isGraphQLRateLimited) {
    return handlePrimaryRateLimit(headers);
  }

  // Handle permission/scope errors
  return handlePermissionError(headers);
}

/**
 * Handle secondary rate limit (abuse detection)
 */
function handleSecondaryRateLimit(
  headers?: Record<string, unknown>
): GitHubAPIError {
  const retryAfter =
    Number(headers?.['retry-after']) ||
    RATE_LIMIT_CONFIG.SECONDARY_FALLBACK_SECONDS;

  return createErrorResponse(ERROR_CODES.RATE_LIMIT_SECONDARY, {
    error: ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_SECONDARY].message(retryAfter),
    status: 403,
    rateLimitRemaining: 0,
    retryAfter,
    scopesSuggestion:
      ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_SECONDARY].suggestion,
  });
}

/**
 * Handle primary rate limit (REST and GraphQL)
 */
function handlePrimaryRateLimit(
  headers?: Record<string, unknown>
): GitHubAPIError {
  const reset = headers?.['x-ratelimit-reset'];
  const resetTime = reset ? new Date(parseInt(String(reset)) * 1000) : null;

  // Calculate retry time with +1 second buffer per GitHub best practices
  const retryAfterSeconds = resetTime
    ? Math.max(
        Math.ceil((resetTime.getTime() - Date.now()) / 1000) +
          RATE_LIMIT_CONFIG.RESET_BUFFER_SECONDS,
        0
      )
    : undefined;

  const errorMessage = resetTime
    ? ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_PRIMARY].messageWithTime(
        resetTime,
        retryAfterSeconds!
      )
    : ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_PRIMARY].messageWithoutTime;

  return createErrorResponse(ERROR_CODES.RATE_LIMIT_PRIMARY, {
    error: errorMessage,
    status: 403,
    rateLimitRemaining: 0,
    rateLimitReset: resetTime ? resetTime.getTime() : undefined,
    retryAfter: retryAfterSeconds,
    scopesSuggestion: ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_PRIMARY].suggestion,
  });
}

/**
 * Handle permission/scope errors
 */
function handlePermissionError(
  headers?: Record<string, unknown>
): GitHubAPIError {
  const acceptedScopes = headers?.['x-accepted-oauth-scopes'];
  const tokenScopes = headers?.['x-oauth-scopes'];

  let scopesSuggestion: string =
    ERROR_MESSAGES[ERROR_CODES.FORBIDDEN_PERMISSIONS].suggestion;

  if (acceptedScopes && tokenScopes) {
    scopesSuggestion = generateScopesSuggestion(
      String(acceptedScopes),
      String(tokenScopes)
    );
  }

  return createErrorResponse(ERROR_CODES.FORBIDDEN_PERMISSIONS, {
    error: ERROR_MESSAGES[ERROR_CODES.FORBIDDEN_PERMISSIONS].message,
    status: 403,
    scopesSuggestion,
  });
}

/**
 * Check if error is GraphQL rate limit
 */
function checkGraphQLRateLimit(response?: RequestError['response']): boolean {
  const errors = (
    response?.data as {
      errors?: Array<{ type?: string }>;
    }
  )?.errors;

  return (
    errors?.some(err => err.type === RATE_LIMIT_PATTERNS.GRAPHQL_TYPE) ?? false
  );
}

/**
 * Handle known HTTP errors (401, 404, 422, 502-504)
 */
function handleKnownHttpError(
  errorCode: ErrorCode,
  status: number
): GitHubAPIError {
  const errorDef = ERROR_MESSAGES[errorCode];

  return createErrorResponse(errorCode, {
    error: errorDef.message as string,
    status,
    ...('suggestion' in errorDef && { scopesSuggestion: errorDef.suggestion }),
  });
}

/**
 * Handle standard JavaScript errors (network, timeout, etc.)
 */
function handleJavaScriptError(error: Error): GitHubAPIError {
  // Check for connection failures
  if (
    NETWORK_ERROR_PATTERNS.CONNECTION_FAILED.some(pattern =>
      error.message.includes(pattern)
    )
  ) {
    return {
      error: ERROR_MESSAGES[ERROR_CODES.NETWORK_CONNECTION_FAILED].message,
      type: 'network',
      scopesSuggestion:
        ERROR_MESSAGES[ERROR_CODES.NETWORK_CONNECTION_FAILED].suggestion,
    };
  }

  // Check for timeout errors
  if (
    NETWORK_ERROR_PATTERNS.TIMEOUT.some(pattern =>
      error.message.includes(pattern)
    )
  ) {
    return {
      error: ERROR_MESSAGES[ERROR_CODES.REQUEST_TIMEOUT].message,
      type: 'network',
      scopesSuggestion: ERROR_MESSAGES[ERROR_CODES.REQUEST_TIMEOUT].suggestion,
    };
  }

  // Unknown JavaScript error
  return {
    error: error.message,
    type: 'unknown',
  };
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  _errorCode: ErrorCode,
  overrides: Partial<GitHubAPIError> & { error: string }
): GitHubAPIError {
  return {
    type: 'http',
    ...overrides,
  } as GitHubAPIError;
}

/**
 * Generate scope suggestions for GitHub API access
 * Compares accepted scopes with current token scopes
 */
function generateScopesSuggestion(
  acceptedScopes: string,
  tokenScopes: string
): string {
  const accepted = acceptedScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const current = tokenScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const missing = accepted.filter(scope => !current.includes(scope));

  if (missing.length > 0) {
    return ERROR_MESSAGES[
      ERROR_CODES.FORBIDDEN_PERMISSIONS
    ].suggestionWithScopes(missing);
  }

  return ERROR_MESSAGES[ERROR_CODES.FORBIDDEN_PERMISSIONS].fallbackSuggestion;
}

/**
 * Generate smart hints for file access issues
 * Provides contextual suggestions based on error type and context
 */
export function generateFileAccessHints(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  defaultBranch?: string | null,
  error?: string
): string[] {
  const hints: string[] = [];

  if (error?.includes('404')) {
    hints.push(
      ...generate404Hints(owner, repo, filePath, branch, defaultBranch)
    );
  } else if (error?.includes('403')) {
    hints.push(...generate403Hints(owner, repo));
  } else if (error?.includes('rate limit')) {
    hints.push(...generateRateLimitHints());
  }

  return hints;
}

/**
 * Generate hints for 404 errors
 */
function generate404Hints(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  defaultBranch?: string | null
): string[] {
  const hints: string[] = [];

  // Suggest trying default branch
  if (defaultBranch && defaultBranch !== branch) {
    hints.push(
      `Try the default branch "${defaultBranch}" instead of "${branch}"`
    );
  }

  // Suggest using tools to verify path
  hints.push(
    `Use githubViewRepoStructure to verify the file path "${filePath}" exists in ${owner}/${repo}`,
    `Use githubSearchCode to find similar files if "${filePath}" has changed or moved`
  );

  // Suggest common branch alternatives
  const commonBranches = ['main', 'master', 'develop', 'dev'];
  const suggestedBranches = commonBranches
    .filter(b => b !== branch && b !== defaultBranch)
    .slice(0, 2);

  if (suggestedBranches.length > 0) {
    hints.push(`Try common branches: ${suggestedBranches.join(', ')}`);
  }

  return hints;
}

/**
 * Generate hints for 403 permission errors
 */
function generate403Hints(owner: string, repo: string): string[] {
  return [
    `Repository ${owner}/${repo} may be private - ensure GITHUB_TOKEN is set`,
    'Check if you have access permissions to this repository',
  ];
}

/**
 * Generate hints for rate limit errors
 */
function generateRateLimitHints(): string[] {
  return [
    'GitHub API rate limit exceeded - wait before retrying',
    'Set GITHUB_TOKEN environment variable for higher rate limits',
  ];
}

// Export error codes for testing and external use
export { ERROR_CODES, ERROR_MESSAGES, type ErrorCode };
