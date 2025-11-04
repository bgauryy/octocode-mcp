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
import { logRateLimit } from '../session.js';

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

function handleSecondaryRateLimit(
  headers?: Record<string, unknown>
): GitHubAPIError {
  const retryAfter =
    Number(headers?.['retry-after']) ||
    RATE_LIMIT_CONFIG.SECONDARY_FALLBACK_SECONDS;

  void logRateLimit({
    limit_type: 'secondary',
    retry_after_seconds: retryAfter,
  });

  return createErrorResponse(ERROR_CODES.RATE_LIMIT_SECONDARY, {
    error: ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_SECONDARY].message(retryAfter),
    status: 403,
    rateLimitRemaining: 0,
    retryAfter,
    scopesSuggestion:
      ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_SECONDARY].suggestion,
  });
}

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

  void logRateLimit({
    limit_type: 'primary',
    retry_after_seconds: retryAfterSeconds,
    rate_limit_remaining: 0,
    rate_limit_reset_ms: resetTime ? resetTime.getTime() : undefined,
  });

  return createErrorResponse(ERROR_CODES.RATE_LIMIT_PRIMARY, {
    error: errorMessage,
    status: 403,
    rateLimitRemaining: 0,
    rateLimitReset: resetTime ? resetTime.getTime() : undefined,
    retryAfter: retryAfterSeconds,
    scopesSuggestion: ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_PRIMARY].suggestion,
  });
}

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

function createErrorResponse(
  _errorCode: ErrorCode,
  overrides: Partial<GitHubAPIError> & { error: string }
): GitHubAPIError {
  return {
    type: 'http',
    ...overrides,
  } as GitHubAPIError;
}

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

//

// Export error codes for testing and external use
export { ERROR_CODES, ERROR_MESSAGES, type ErrorCode };
