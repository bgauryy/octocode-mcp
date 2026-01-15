/**
 * GitLab Error Handling
 *
 * Handles GitLab API errors and transforms them to standardized format.
 * Note: GitLab uses HTTP 429 for rate limiting (not 403 like GitHub).
 *
 * @module gitlab/errors
 */

import type { GitLabAPIError, GitLabAPIResponse } from './types.js';

// ============================================================================
// ERROR CONSTANTS
// ============================================================================

export const GITLAB_ERROR_CODES = {
  RATE_LIMITED: {
    code: 'GL_RATE_LIMITED',
    message: 'GitLab API rate limit exceeded. Please wait before retrying.',
  },
  UNAUTHORIZED: {
    code: 'GL_UNAUTHORIZED',
    message: 'GitLab authentication failed. Check your GITLAB_TOKEN.',
  },
  FORBIDDEN: {
    code: 'GL_FORBIDDEN',
    message: 'Access denied. You may not have permission for this resource.',
  },
  NOT_FOUND: {
    code: 'GL_NOT_FOUND',
    message: 'Resource not found. Check the project ID, path, or reference.',
  },
  BAD_REQUEST: {
    code: 'GL_BAD_REQUEST',
    message: 'Invalid request parameters.',
  },
  SERVER_ERROR: {
    code: 'GL_SERVER_ERROR',
    message: 'GitLab server error. Please try again later.',
  },
  NETWORK_ERROR: {
    code: 'GL_NETWORK_ERROR',
    message: 'Network error connecting to GitLab.',
  },
  PREMIUM_REQUIRED: {
    code: 'GL_PREMIUM_REQUIRED',
    message: 'This feature requires GitLab Premium or higher.',
  },
} as const;

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handle GitLab API errors and convert to standardized format.
 *
 * @param error - The error to handle
 * @returns GitLabAPIError response
 */
export function handleGitLabAPIError(error: unknown): GitLabAPIError {
  // Handle Gitbeaker errors
  if (isGitbeakerError(error)) {
    return handleGitbeakerError(error);
  }

  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      error: GITLAB_ERROR_CODES.NETWORK_ERROR.message,
      status: 0,
      type: 'network',
      hints: ['Check your network connection and GitLab host configuration.'],
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      error: error.message,
      status: 500,
      type: 'unknown',
    };
  }

  // Unknown error type
  return {
    error: 'An unknown error occurred',
    status: 500,
    type: 'unknown',
  };
}

/**
 * Check if error is a Gitbeaker error.
 */
function isGitbeakerError(error: unknown): error is GitbeakerError {
  return (
    error !== null &&
    typeof error === 'object' &&
    ('cause' in error || 'response' in error || 'status' in error)
  );
}

interface GitbeakerError {
  message?: string;
  cause?: {
    description?: string;
    status?: number;
  };
  response?: {
    status?: number;
    headers?: {
      'ratelimit-remaining'?: string;
      'ratelimit-reset'?: string;
      'retry-after'?: string;
    };
  };
  status?: number;
}

/**
 * Handle Gitbeaker-specific errors.
 */
function handleGitbeakerError(error: GitbeakerError): GitLabAPIError {
  const status =
    error.cause?.status || error.response?.status || error.status || 500;
  const message = error.cause?.description || error.message || 'Unknown error';

  // Rate limit (HTTP 429)
  if (status === 429) {
    const retryAfter = error.response?.headers?.['retry-after'];
    const rateLimitReset = error.response?.headers?.['ratelimit-reset'];

    return {
      error: GITLAB_ERROR_CODES.RATE_LIMITED.message,
      status: 429,
      type: 'http',
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      rateLimitReset: rateLimitReset ? parseInt(rateLimitReset, 10) : undefined,
      hints: [
        `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please wait before retrying.'}`,
        'Consider reducing request frequency or using pagination.',
      ],
    };
  }

  // Unauthorized (HTTP 401)
  if (status === 401) {
    return {
      error: GITLAB_ERROR_CODES.UNAUTHORIZED.message,
      status: 401,
      type: 'http',
      hints: [
        'Check that your GITLAB_TOKEN is valid and not expired.',
        'Ensure the token has the required scopes (read_api, read_repository).',
      ],
    };
  }

  // Forbidden (HTTP 403)
  if (status === 403) {
    // Check for Premium feature restriction
    if (message.includes('Premium') || message.includes('Ultimate')) {
      return {
        error: GITLAB_ERROR_CODES.PREMIUM_REQUIRED.message,
        status: 403,
        type: 'http',
        hints: [
          'This feature requires GitLab Premium or Ultimate subscription.',
          'Global and group code search requires Premium tier.',
        ],
      };
    }

    return {
      error: GITLAB_ERROR_CODES.FORBIDDEN.message,
      status: 403,
      type: 'http',
      hints: [
        'You may not have permission to access this resource.',
        'Check project visibility and your access level.',
      ],
    };
  }

  // Not found (HTTP 404)
  if (status === 404) {
    return {
      error: GITLAB_ERROR_CODES.NOT_FOUND.message,
      status: 404,
      type: 'http',
      hints: [
        'Check that the project ID or path is correct.',
        'Verify the file path and reference (branch/tag) exist.',
        'Ensure you have access to the project.',
      ],
    };
  }

  // Bad request (HTTP 400)
  if (status === 400) {
    return {
      error: `${GITLAB_ERROR_CODES.BAD_REQUEST.message}: ${message}`,
      status: 400,
      type: 'http',
      hints: ['Check your request parameters for invalid values.'],
    };
  }

  // Server errors (HTTP 5xx)
  if (status >= 500) {
    return {
      error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
      status,
      type: 'http',
      hints: ['GitLab may be experiencing issues. Try again later.'],
    };
  }

  // Default error response
  return {
    error: message,
    status,
    type: 'http',
  };
}

/**
 * Create a standardized error response.
 */
export function createGitLabError(
  message: string,
  status: number = 500,
  hints?: string[]
): GitLabAPIResponse<never> {
  return {
    error: message,
    status,
    type: 'http',
    hints,
  };
}

/**
 * Check if an error response indicates rate limiting.
 */
export function isRateLimitError(error: GitLabAPIError): boolean {
  return error.status === 429;
}

/**
 * Get retry delay from rate limit error.
 *
 * @param error - Rate limit error
 * @returns Delay in milliseconds, or undefined if not available
 */
export function getRateLimitRetryDelay(
  error: GitLabAPIError
): number | undefined {
  if (error.retryAfter) {
    return error.retryAfter * 1000;
  }
  if (error.rateLimitReset) {
    const resetTime = error.rateLimitReset * 1000;
    const now = Date.now();
    return resetTime > now ? resetTime - now : undefined;
  }
  return undefined;
}
