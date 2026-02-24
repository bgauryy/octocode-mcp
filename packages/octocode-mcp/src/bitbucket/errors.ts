/**
 * Bitbucket Error Handling
 *
 * Handles Bitbucket API errors and transforms them to standardized format.
 *
 * @module bitbucket/errors
 */

import type { BitbucketAPIError, BitbucketAPIResponse } from './types.js';

// ============================================================================
// ERROR CONSTANTS
// ============================================================================

export const BITBUCKET_ERROR_CODES = {
  RATE_LIMITED: {
    code: 'BB_RATE_LIMITED',
    message: 'Bitbucket API rate limit exceeded. Please wait before retrying.',
  },
  UNAUTHORIZED: {
    code: 'BB_UNAUTHORIZED',
    message: 'Bitbucket authentication failed. Check your BITBUCKET_TOKEN.',
  },
  FORBIDDEN: {
    code: 'BB_FORBIDDEN',
    message: 'Access denied. Check Bitbucket app password permissions.',
  },
  NOT_FOUND: {
    code: 'BB_NOT_FOUND',
    message: 'Resource not found. Check the workspace, repo slug, and path.',
  },
  BAD_REQUEST: {
    code: 'BB_BAD_REQUEST',
    message: 'Invalid request parameters.',
  },
  SERVER_ERROR: {
    code: 'BB_SERVER_ERROR',
    message: 'Bitbucket server error. Please try again later.',
  },
  NETWORK_ERROR: {
    code: 'BB_NETWORK_ERROR',
    message: 'Network error connecting to Bitbucket.',
  },
} as const;

// ============================================================================
// ERROR HANDLING
// ============================================================================

export function handleBitbucketAPIError(error: unknown): BitbucketAPIError {
  if (isBitbucketHTTPError(error)) {
    return handleHTTPError(error);
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      error: BITBUCKET_ERROR_CODES.NETWORK_ERROR.message,
      status: 0,
      type: 'network',
      hints: [
        'Check your network connection and Bitbucket host configuration.',
      ],
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      status: 500,
      type: 'unknown',
    };
  }

  return {
    error: 'An unknown error occurred',
    status: 500,
    type: 'unknown',
  };
}

interface BitbucketHTTPError {
  message?: string;
  status?: number;
  statusCode?: number;
  response?: Response;
}

function isBitbucketHTTPError(error: unknown): error is BitbucketHTTPError {
  return (
    error !== null &&
    typeof error === 'object' &&
    ('status' in error || 'statusCode' in error || 'response' in error)
  );
}

function handleHTTPError(error: BitbucketHTTPError): BitbucketAPIError {
  const status = error.status || error.statusCode || 500;
  const message = error.message || 'Unknown error';

  if (status === 429) {
    const rateLimitData = error.response?.headers
      ? extractRateLimitFromHeaders(error.response.headers)
      : {};

    return {
      error: BITBUCKET_ERROR_CODES.RATE_LIMITED.message,
      status: 429,
      type: 'http',
      rateLimitRemaining: rateLimitData.remaining,
      rateLimitReset: rateLimitData.reset,
      retryAfter: rateLimitData.retryAfter,
      hints: [
        `Rate limit exceeded.${rateLimitData.retryAfter ? ` Retry after ${rateLimitData.retryAfter} seconds.` : ' Wait before retrying.'}`,
        'Consider reducing request frequency.',
      ],
    };
  }

  if (status === 401) {
    return {
      error: BITBUCKET_ERROR_CODES.UNAUTHORIZED.message,
      status: 401,
      type: 'http',
      hints: [
        'Check that your BITBUCKET_TOKEN is valid and not expired.',
        'If using app passwords, ensure BITBUCKET_USERNAME is also set.',
      ],
    };
  }

  if (status === 403) {
    return {
      error: BITBUCKET_ERROR_CODES.FORBIDDEN.message,
      status: 403,
      type: 'http',
      hints: [
        'Your token may lack required scopes.',
        'Check Bitbucket app password permissions (repository, pullrequest, account).',
      ],
    };
  }

  if (status === 404) {
    return {
      error: BITBUCKET_ERROR_CODES.NOT_FOUND.message,
      status: 404,
      type: 'http',
      hints: [
        'Check that the workspace and repo_slug are correct.',
        'Verify the file path and branch/commit exist.',
        'Ensure you have access to the repository.',
      ],
    };
  }

  if (status === 400) {
    return {
      error: `${BITBUCKET_ERROR_CODES.BAD_REQUEST.message}: ${message}`,
      status: 400,
      type: 'http',
      hints: ['Check your request parameters for invalid values.'],
    };
  }

  if (status >= 500) {
    return {
      error: BITBUCKET_ERROR_CODES.SERVER_ERROR.message,
      status,
      type: 'http',
      hints: ['Bitbucket may be experiencing issues. Try again later.'],
    };
  }

  return {
    error: message,
    status,
    type: 'http',
  };
}

export function createBitbucketError(
  message: string,
  status: number = 500,
  hints?: string[]
): BitbucketAPIResponse<never> {
  return {
    error: message,
    status,
    type: 'http',
    hints,
  };
}

export function isRateLimitError(error: BitbucketAPIError): boolean {
  return error.status === 429;
}

export function extractRateLimitFromHeaders(headers: Headers): {
  remaining?: number;
  reset?: number;
  retryAfter?: number;
} {
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const retryAfter = headers.get('retry-after');

  const parsedRemaining = remaining ? parseInt(remaining, 10) : NaN;
  const parsedReset = reset ? parseInt(reset, 10) : NaN;
  const parsedRetryAfter = retryAfter ? parseInt(retryAfter, 10) : NaN;

  return {
    remaining: !isNaN(parsedRemaining) ? parsedRemaining : undefined,
    reset: !isNaN(parsedReset) ? parsedReset : undefined,
    retryAfter: !isNaN(parsedRetryAfter) ? parsedRetryAfter : undefined,
  };
}
