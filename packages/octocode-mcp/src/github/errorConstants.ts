/**
 * GitHub API Error Constants
 * Centralized error definitions with keys, messages, and explanations
 */

/**
 * Error codes for internal tracking and testing
 */
export const ERROR_CODES = {
  // Authentication Errors (401)
  AUTH_REQUIRED: 'AUTH_REQUIRED',

  // Forbidden Errors (403)
  RATE_LIMIT_PRIMARY: 'RATE_LIMIT_PRIMARY',
  RATE_LIMIT_SECONDARY: 'RATE_LIMIT_SECONDARY',
  FORBIDDEN_PERMISSIONS: 'FORBIDDEN_PERMISSIONS',

  // Not Found Errors (404)
  NOT_FOUND: 'NOT_FOUND',

  // Validation Errors (422)
  INVALID_REQUEST: 'INVALID_REQUEST',

  // Server Errors (502, 503, 504)
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',

  // Network Errors
  NETWORK_CONNECTION_FAILED: 'NETWORK_CONNECTION_FAILED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',

  // Unknown Errors
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Error message templates with explanations
 */
export const ERROR_MESSAGES = {
  /**
   * 401 - Authentication Required
   * When: No token provided or token is invalid
   * Cause: Missing/invalid GITHUB_TOKEN or GH_TOKEN
   * Fix: Set valid GitHub personal access token
   */
  [ERROR_CODES.AUTH_REQUIRED]: {
    message: 'GitHub authentication required',
    suggestion: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
    explanation:
      'API request requires authentication. GitHub APIs have different rate limits for authenticated (5000/hour) vs unauthenticated (60/hour) requests.',
  },

  /**
   * 403 - Primary Rate Limit Exceeded
   * When: Used all API quota for current hour (REST or GraphQL)
   * Cause: Too many requests within rate limit window
   * Fix: Wait until rate limit resets, or use authenticated requests for higher limits
   * Docs: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting
   */
  [ERROR_CODES.RATE_LIMIT_PRIMARY]: {
    message: 'GitHub API rate limit exceeded',
    messageWithTime: (resetTime: Date, seconds: number) =>
      `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()} (in ${seconds} seconds)`,
    messageWithoutTime:
      'GitHub API rate limit exceeded. Reset time unavailable - check GitHub status or try again later',
    suggestion:
      'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
    explanation:
      'Primary rate limit tracks total API calls per hour. Authenticated users get 5000 requests/hour, unauthenticated get 60 requests/hour.',
  },

  /**
   * 403 - Secondary Rate Limit (Abuse Detection)
   * When: Making requests too quickly (abuse detection)
   * Cause: High frequency of requests triggering anti-abuse mechanisms
   * Fix: Slow down request rate, add delays between requests
   * Docs: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#secondary-rate-limits
   */
  [ERROR_CODES.RATE_LIMIT_SECONDARY]: {
    message: (retryAfter: number) =>
      `GitHub secondary rate limit triggered. Retry after ${retryAfter} seconds`,
    suggestion: 'Reduce request frequency to avoid abuse detection',
    explanation:
      'Secondary rate limits prevent API abuse by limiting request frequency. Triggered by making too many requests too quickly, regardless of remaining quota.',
    fallbackRetryAfter: 60, // Default to 60 seconds if no retry-after header
  },

  /**
   * 403 - Forbidden (Insufficient Permissions)
   * When: Token lacks required scopes for the operation
   * Cause: GitHub token missing necessary OAuth scopes
   * Fix: Refresh token with required scopes using gh CLI
   */
  [ERROR_CODES.FORBIDDEN_PERMISSIONS]: {
    message: 'Access forbidden - insufficient permissions',
    suggestion: 'Check repository permissions or authentication',
    suggestionWithScopes: (missing: string[]) =>
      `Missing required scopes: ${missing.join(', ')}. Run: gh auth refresh -s ${missing.join(' -s ')}`,
    fallbackSuggestion:
      'Token may not have sufficient permissions for this operation',
    explanation:
      'GitHub tokens require specific OAuth scopes for different operations. Common scopes: repo (full repository access), read:org (organization access), gist (gist access).',
  },

  /**
   * 404 - Not Found
   * When: Repository, file, or resource does not exist or is inaccessible
   * Cause: Wrong path, deleted resource, or private repo without access
   * Fix: Verify resource exists, check spelling, ensure token has access to private repos
   */
  [ERROR_CODES.NOT_FOUND]: {
    message: 'Repository, resource, or path not found',
    explanation:
      'Resource not found or not accessible. Could be: incorrect path, deleted resource, private repository without access, wrong branch name.',
  },

  /**
   * 422 - Unprocessable Entity (Validation Error)
   * When: Request parameters are invalid or malformed
   * Cause: Invalid search query syntax, invalid parameter values
   * Fix: Check API documentation for correct parameter format
   * Docs: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#client-errors
   */
  [ERROR_CODES.INVALID_REQUEST]: {
    message: 'Invalid search query or request parameters',
    suggestion: 'Check search syntax and parameter values',
    explanation:
      'Request was well-formed but contains invalid parameters. Common causes: invalid search syntax, parameters out of range, invalid filter combinations.',
  },

  /**
   * 502/503/504 - Server Errors
   * When: GitHub API is temporarily unavailable
   * Cause: GitHub server issues, maintenance, or overload
   * Fix: Retry after a short delay, check GitHub status page
   */
  [ERROR_CODES.SERVER_UNAVAILABLE]: {
    message: 'GitHub API temporarily unavailable',
    suggestion: 'Retry the request after a short delay',
    explanation:
      'GitHub servers are temporarily unavailable. Usually resolves quickly. Check https://www.githubstatus.com for service status.',
  },

  /**
   * Network Error - Connection Failed
   * When: Cannot reach GitHub API servers
   * Cause: No internet connection, DNS failure, firewall blocking
   * Fix: Check internet connection, verify DNS resolution, check firewall settings
   */
  [ERROR_CODES.NETWORK_CONNECTION_FAILED]: {
    message: 'Network connection failed',
    suggestion: 'Check internet connection and GitHub API status',
    explanation:
      'Cannot establish connection to GitHub API. Check internet connectivity, DNS settings, and firewall/proxy configuration.',
  },

  /**
   * Network Error - Request Timeout
   * When: Request takes too long to complete
   * Cause: Slow network, large response, GitHub server delay
   * Fix: Retry request, check network speed, consider pagination for large requests
   */
  [ERROR_CODES.REQUEST_TIMEOUT]: {
    message: 'Request timeout',
    suggestion: 'Retry the request or check network connectivity',
    explanation:
      'Request exceeded timeout limit. Could be slow network, large response size, or GitHub server delay.',
  },

  /**
   * Unknown Error
   * When: Unrecognized error occurred
   * Cause: Unexpected error not matching known patterns
   * Fix: Check error message for details, report if persistent
   */
  [ERROR_CODES.UNKNOWN]: {
    message: 'Unknown error occurred',
    explanation:
      'An unexpected error occurred that does not match known error patterns.',
  },
} as const;

/**
 * HTTP status code to error code mapping
 */
export const STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  401: ERROR_CODES.AUTH_REQUIRED,
  403: ERROR_CODES.FORBIDDEN_PERMISSIONS, // Default, may be overridden by specific checks
  404: ERROR_CODES.NOT_FOUND,
  422: ERROR_CODES.INVALID_REQUEST,
  502: ERROR_CODES.SERVER_UNAVAILABLE,
  503: ERROR_CODES.SERVER_UNAVAILABLE,
  504: ERROR_CODES.SERVER_UNAVAILABLE,
};

/**
 * Network error patterns
 */
export const NETWORK_ERROR_PATTERNS = {
  CONNECTION_FAILED: ['ENOTFOUND', 'ECONNREFUSED'],
  TIMEOUT: ['timeout'],
} as const;

/**
 * Rate limit detection patterns
 */
export const RATE_LIMIT_PATTERNS = {
  SECONDARY: /\bsecondary rate\b/i,
  GRAPHQL_TYPE: 'RATE_LIMITED',
} as const;

/**
 * Rate limit configuration
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * Add 1 second buffer to rate limit reset time per GitHub best practices
   * Docs: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#exceeding-the-rate-limit
   */
  RESET_BUFFER_SECONDS: 1,

  /**
   * Default secondary rate limit retry delay when no retry-after header present
   */
  SECONDARY_FALLBACK_SECONDS: 60,
} as const;
