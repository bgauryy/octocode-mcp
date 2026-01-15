import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleGitLabAPIError,
  createGitLabError,
  isRateLimitError,
  getRateLimitRetryDelay,
  GITLAB_ERROR_CODES,
} from '../../src/gitlab/errors.js';
import type { GitLabAPIError } from '../../src/gitlab/types.js';

describe('GitLab Error Handling', () => {
  describe('GITLAB_ERROR_CODES', () => {
    it('should have correct rate limited error code', () => {
      expect(GITLAB_ERROR_CODES.RATE_LIMITED).toEqual({
        code: 'GL_RATE_LIMITED',
        message: 'GitLab API rate limit exceeded. Please wait before retrying.',
      });
    });

    it('should have correct unauthorized error code', () => {
      expect(GITLAB_ERROR_CODES.UNAUTHORIZED).toEqual({
        code: 'GL_UNAUTHORIZED',
        message: 'GitLab authentication failed. Check your GITLAB_TOKEN.',
      });
    });

    it('should have correct forbidden error code', () => {
      expect(GITLAB_ERROR_CODES.FORBIDDEN).toEqual({
        code: 'GL_FORBIDDEN',
        message:
          'Access denied. You may not have permission for this resource.',
      });
    });

    it('should have correct not found error code', () => {
      expect(GITLAB_ERROR_CODES.NOT_FOUND).toEqual({
        code: 'GL_NOT_FOUND',
        message:
          'Resource not found. Check the project ID, path, or reference.',
      });
    });

    it('should have correct bad request error code', () => {
      expect(GITLAB_ERROR_CODES.BAD_REQUEST).toEqual({
        code: 'GL_BAD_REQUEST',
        message: 'Invalid request parameters.',
      });
    });

    it('should have correct server error code', () => {
      expect(GITLAB_ERROR_CODES.SERVER_ERROR).toEqual({
        code: 'GL_SERVER_ERROR',
        message: 'GitLab server error. Please try again later.',
      });
    });

    it('should have correct network error code', () => {
      expect(GITLAB_ERROR_CODES.NETWORK_ERROR).toEqual({
        code: 'GL_NETWORK_ERROR',
        message: 'Network error connecting to GitLab.',
      });
    });

    it('should have correct premium required error code', () => {
      expect(GITLAB_ERROR_CODES.PREMIUM_REQUIRED).toEqual({
        code: 'GL_PREMIUM_REQUIRED',
        message: 'This feature requires GitLab Premium or higher.',
      });
    });
  });

  describe('handleGitLabAPIError', () => {
    describe('HTTP 429 - Rate Limit', () => {
      it('should handle rate limit error with retry-after header', () => {
        const error = {
          cause: {
            description: 'Rate limit exceeded',
            status: 429,
          },
          response: {
            status: 429,
            headers: {
              'retry-after': '60',
            },
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.RATE_LIMITED.message,
          status: 429,
          type: 'http',
          retryAfter: 60,
          rateLimitReset: undefined,
          hints: [
            'Rate limit exceeded. Retry after 60 seconds.',
            'Consider reducing request frequency or using pagination.',
          ],
        });
      });

      it('should handle rate limit error with ratelimit-reset header', () => {
        const resetTime = Math.floor(Date.now() / 1000) + 120;
        const error = {
          status: 429,
          response: {
            status: 429,
            headers: {
              'ratelimit-reset': String(resetTime),
            },
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.RATE_LIMITED.message,
          status: 429,
          type: 'http',
          retryAfter: undefined,
          rateLimitReset: resetTime,
          hints: [
            'Rate limit exceeded. Please wait before retrying.',
            'Consider reducing request frequency or using pagination.',
          ],
        });
      });

      it('should handle rate limit error without headers', () => {
        const error = {
          cause: {
            status: 429,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.RATE_LIMITED.message,
          status: 429,
          type: 'http',
          retryAfter: undefined,
          rateLimitReset: undefined,
          hints: [
            'Rate limit exceeded. Please wait before retrying.',
            'Consider reducing request frequency or using pagination.',
          ],
        });
      });

      it('should handle rate limit error with both retry-after and ratelimit-reset', () => {
        const resetTime = Math.floor(Date.now() / 1000) + 300;
        const error = {
          status: 429,
          response: {
            status: 429,
            headers: {
              'retry-after': '45',
              'ratelimit-reset': String(resetTime),
            },
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toMatchObject({
          error: GITLAB_ERROR_CODES.RATE_LIMITED.message,
          status: 429,
          type: 'http',
          retryAfter: 45,
          rateLimitReset: resetTime,
        });
      });
    });

    describe('HTTP 401 - Unauthorized', () => {
      it('should handle unauthorized error from cause', () => {
        const error = {
          cause: {
            description: 'Unauthorized',
            status: 401,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.UNAUTHORIZED.message,
          status: 401,
          type: 'http',
          hints: [
            'Check that your GITLAB_TOKEN is valid and not expired.',
            'Ensure the token has the required scopes (read_api, read_repository).',
          ],
        });
      });

      it('should handle unauthorized error from response', () => {
        const error = {
          message: 'Authentication required',
          response: {
            status: 401,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.UNAUTHORIZED.message,
          status: 401,
          type: 'http',
          hints: [
            'Check that your GITLAB_TOKEN is valid and not expired.',
            'Ensure the token has the required scopes (read_api, read_repository).',
          ],
        });
      });

      it('should handle unauthorized error from status property', () => {
        const error = {
          status: 401,
          message: 'Invalid token',
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.UNAUTHORIZED.message,
          status: 401,
          type: 'http',
          hints: [
            'Check that your GITLAB_TOKEN is valid and not expired.',
            'Ensure the token has the required scopes (read_api, read_repository).',
          ],
        });
      });
    });

    describe('HTTP 403 - Forbidden', () => {
      it('should handle forbidden error without Premium message', () => {
        const error = {
          cause: {
            description: 'Access denied',
            status: 403,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.FORBIDDEN.message,
          status: 403,
          type: 'http',
          hints: [
            'You may not have permission to access this resource.',
            'Check project visibility and your access level.',
          ],
        });
      });

      it('should handle forbidden error with Premium requirement', () => {
        const error = {
          cause: {
            description: 'This feature requires GitLab Premium',
            status: 403,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.PREMIUM_REQUIRED.message,
          status: 403,
          type: 'http',
          hints: [
            'This feature requires GitLab Premium or Ultimate subscription.',
            'Global and group code search requires Premium tier.',
          ],
        });
      });

      it('should handle forbidden error with Ultimate requirement', () => {
        const error = {
          message: 'Feature only available on GitLab Ultimate',
          status: 403,
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.PREMIUM_REQUIRED.message,
          status: 403,
          type: 'http',
          hints: [
            'This feature requires GitLab Premium or Ultimate subscription.',
            'Global and group code search requires Premium tier.',
          ],
        });
      });

      it('should detect Premium in message from cause.description', () => {
        const error = {
          cause: {
            description:
              'Global code search is available with Premium subscription',
            status: 403,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result.error).toBe(GITLAB_ERROR_CODES.PREMIUM_REQUIRED.message);
      });
    });

    describe('HTTP 404 - Not Found', () => {
      it('should handle not found error from cause', () => {
        const error = {
          cause: {
            description: 'Project not found',
            status: 404,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.NOT_FOUND.message,
          status: 404,
          type: 'http',
          hints: [
            'Check that the project ID or path is correct.',
            'Verify the file path and reference (branch/tag) exist.',
            'Ensure you have access to the project.',
          ],
        });
      });

      it('should handle not found error from response status', () => {
        const error = {
          message: 'Resource not found',
          response: {
            status: 404,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.NOT_FOUND.message,
          status: 404,
          type: 'http',
          hints: [
            'Check that the project ID or path is correct.',
            'Verify the file path and reference (branch/tag) exist.',
            'Ensure you have access to the project.',
          ],
        });
      });
    });

    describe('HTTP 400 - Bad Request', () => {
      it('should handle bad request error with description', () => {
        const error = {
          cause: {
            description: 'Invalid search parameter',
            status: 400,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: `${GITLAB_ERROR_CODES.BAD_REQUEST.message}: Invalid search parameter`,
          status: 400,
          type: 'http',
          hints: ['Check your request parameters for invalid values.'],
        });
      });

      it('should handle bad request error with message fallback', () => {
        const error = {
          message: 'Query too short',
          status: 400,
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: `${GITLAB_ERROR_CODES.BAD_REQUEST.message}: Query too short`,
          status: 400,
          type: 'http',
          hints: ['Check your request parameters for invalid values.'],
        });
      });

      it('should handle bad request error without message', () => {
        const error = {
          response: {
            status: 400,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: `${GITLAB_ERROR_CODES.BAD_REQUEST.message}: Unknown error`,
          status: 400,
          type: 'http',
          hints: ['Check your request parameters for invalid values.'],
        });
      });
    });

    describe('HTTP 5xx - Server Errors', () => {
      it('should handle 500 Internal Server Error', () => {
        const error = {
          cause: {
            description: 'Internal Server Error',
            status: 500,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
          status: 500,
          type: 'http',
          hints: ['GitLab may be experiencing issues. Try again later.'],
        });
      });

      it('should handle 502 Bad Gateway', () => {
        const error = {
          status: 502,
          message: 'Bad Gateway',
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
          status: 502,
          type: 'http',
          hints: ['GitLab may be experiencing issues. Try again later.'],
        });
      });

      it('should handle 503 Service Unavailable', () => {
        const error = {
          response: {
            status: 503,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
          status: 503,
          type: 'http',
          hints: ['GitLab may be experiencing issues. Try again later.'],
        });
      });

      it('should handle 504 Gateway Timeout', () => {
        const error = {
          cause: {
            status: 504,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
          status: 504,
          type: 'http',
          hints: ['GitLab may be experiencing issues. Try again later.'],
        });
      });

      it('should handle 520 Unknown Error', () => {
        const error = {
          status: 520,
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.SERVER_ERROR.message,
          status: 520,
          type: 'http',
          hints: ['GitLab may be experiencing issues. Try again later.'],
        });
      });
    });

    describe('Network Errors', () => {
      it('should handle fetch TypeError', () => {
        const error = new TypeError('Failed to fetch');

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.NETWORK_ERROR.message,
          status: 0,
          type: 'network',
          hints: [
            'Check your network connection and GitLab host configuration.',
          ],
        });
      });

      it('should handle fetch failure with detailed message', () => {
        const error = new TypeError('fetch failed: ENOTFOUND gitlab.com');

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: GITLAB_ERROR_CODES.NETWORK_ERROR.message,
          status: 0,
          type: 'network',
          hints: [
            'Check your network connection and GitLab host configuration.',
          ],
        });
      });

      it('should handle TypeError without fetch keyword as generic error', () => {
        const error = new TypeError('Cannot read properties of undefined');

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: 'Cannot read properties of undefined',
          status: 500,
          type: 'unknown',
        });
      });
    });

    describe('Generic Errors', () => {
      it('should handle standard Error object', () => {
        const error = new Error('Something went wrong');

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: 'Something went wrong',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle Error with empty message', () => {
        const error = new Error('');

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: '',
          status: 500,
          type: 'unknown',
        });
      });
    });

    describe('Unknown Error Types', () => {
      it('should handle null error', () => {
        const result = handleGitLabAPIError(null);

        expect(result).toEqual({
          error: 'An unknown error occurred',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle undefined error', () => {
        const result = handleGitLabAPIError(undefined);

        expect(result).toEqual({
          error: 'An unknown error occurred',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle string error', () => {
        const result = handleGitLabAPIError('String error message');

        expect(result).toEqual({
          error: 'An unknown error occurred',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle number error', () => {
        const result = handleGitLabAPIError(42);

        expect(result).toEqual({
          error: 'An unknown error occurred',
          status: 500,
          type: 'unknown',
        });
      });

      it('should handle empty object', () => {
        const result = handleGitLabAPIError({});

        expect(result).toEqual({
          error: 'An unknown error occurred',
          status: 500,
          type: 'unknown',
        });
      });
    });

    describe('Gitbeaker Error Status Priority', () => {
      it('should prioritize cause.status over other sources', () => {
        const error = {
          cause: {
            status: 401,
            description: 'Unauthorized from cause',
          },
          response: {
            status: 500,
          },
          status: 404,
        };

        const result = handleGitLabAPIError(error);

        expect(result.status).toBe(401);
      });

      it('should use response.status when cause.status is missing', () => {
        const error = {
          cause: {
            description: 'Some error',
          },
          response: {
            status: 403,
          },
          status: 500,
        };

        const result = handleGitLabAPIError(error);

        expect(result.status).toBe(403);
      });

      it('should use status property when cause and response status missing', () => {
        const error = {
          cause: {},
          response: {},
          status: 404,
        };

        const result = handleGitLabAPIError(error);

        expect(result.status).toBe(404);
      });

      it('should default to 500 when no status is available', () => {
        const error = {
          cause: {},
        };

        const result = handleGitLabAPIError(error);

        expect(result.status).toBe(500);
      });
    });

    describe('Gitbeaker Error Message Priority', () => {
      it('should prioritize cause.description over message', () => {
        const error = {
          cause: {
            description: 'Description from cause',
            status: 400,
          },
          message: 'General message',
        };

        const result = handleGitLabAPIError(error);

        expect(result.error).toContain('Description from cause');
      });

      it('should use message when cause.description is missing', () => {
        const error = {
          cause: {
            status: 400,
          },
          message: 'Fallback message',
        };

        const result = handleGitLabAPIError(error);

        expect(result.error).toContain('Fallback message');
      });

      it('should use Unknown error when no message available', () => {
        const error = {
          cause: {
            status: 400,
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result.error).toContain('Unknown error');
      });
    });

    describe('Default HTTP Error Handling', () => {
      it('should handle unrecognized status codes', () => {
        const error = {
          cause: {
            description: 'Custom error message',
            status: 418, // I'm a teapot
          },
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: 'Custom error message',
          status: 418,
          type: 'http',
        });
      });

      it('should handle status codes below 400', () => {
        const error = {
          status: 301,
          message: 'Moved Permanently',
        };

        const result = handleGitLabAPIError(error);

        expect(result).toEqual({
          error: 'Moved Permanently',
          status: 301,
          type: 'http',
        });
      });
    });
  });

  describe('createGitLabError', () => {
    it('should create error with message only', () => {
      const result = createGitLabError('Custom error message');

      expect(result).toEqual({
        error: 'Custom error message',
        status: 500,
        type: 'http',
        hints: undefined,
      });
    });

    it('should create error with message and status', () => {
      const result = createGitLabError('Not found error', 404);

      expect(result).toEqual({
        error: 'Not found error',
        status: 404,
        type: 'http',
        hints: undefined,
      });
    });

    it('should create error with message, status, and hints', () => {
      const hints = ['Check your configuration', 'Verify access permissions'];
      const result = createGitLabError('Access denied', 403, hints);

      expect(result).toEqual({
        error: 'Access denied',
        status: 403,
        type: 'http',
        hints: ['Check your configuration', 'Verify access permissions'],
      });
    });

    it('should create error with empty hints array', () => {
      const result = createGitLabError('Some error', 400, []);

      expect(result).toEqual({
        error: 'Some error',
        status: 400,
        type: 'http',
        hints: [],
      });
    });

    it('should create error with zero status', () => {
      const result = createGitLabError('Network error', 0);

      expect(result).toEqual({
        error: 'Network error',
        status: 0,
        type: 'http',
        hints: undefined,
      });
    });

    it('should create error with empty message', () => {
      const result = createGitLabError('');

      expect(result).toEqual({
        error: '',
        status: 500,
        type: 'http',
        hints: undefined,
      });
    });
  });

  describe('isRateLimitError', () => {
    it('should return true for status 429', () => {
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
      };

      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for status 403', () => {
      const error: GitLabAPIError = {
        error: 'Forbidden',
        status: 403,
        type: 'http',
      };

      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for status 401', () => {
      const error: GitLabAPIError = {
        error: 'Unauthorized',
        status: 401,
        type: 'http',
      };

      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for status 500', () => {
      const error: GitLabAPIError = {
        error: 'Server error',
        status: 500,
        type: 'http',
      };

      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for undefined status', () => {
      const error: GitLabAPIError = {
        error: 'Unknown error',
        type: 'unknown',
      };

      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for network error', () => {
      const error: GitLabAPIError = {
        error: 'Network error',
        status: 0,
        type: 'network',
      };

      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe('getRateLimitRetryDelay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return retryAfter in milliseconds', () => {
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        retryAfter: 60,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBe(60000);
    });

    it('should calculate delay from rateLimitReset when retryAfter is missing', () => {
      const now = 1640995200000; // Fixed timestamp
      vi.setSystemTime(now);

      const resetTime = Math.floor(now / 1000) + 120; // 120 seconds in the future
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        rateLimitReset: resetTime,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBe(120000); // 120 seconds * 1000
    });

    it('should prefer retryAfter over rateLimitReset', () => {
      const now = 1640995200000;
      vi.setSystemTime(now);

      const resetTime = Math.floor(now / 1000) + 300;
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        retryAfter: 30,
        rateLimitReset: resetTime,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBe(30000); // Uses retryAfter, not rateLimitReset
    });

    it('should return undefined when rateLimitReset is in the past', () => {
      const now = 1640995200000;
      vi.setSystemTime(now);

      const resetTime = Math.floor(now / 1000) - 60; // 60 seconds in the past
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        rateLimitReset: resetTime,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no retry information available', () => {
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBeUndefined();
    });

    it('should return undefined for non-rate-limit errors', () => {
      const error: GitLabAPIError = {
        error: 'Not found',
        status: 404,
        type: 'http',
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBeUndefined();
    });

    it('should handle retryAfter of 0', () => {
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        retryAfter: 0,
      };

      const result = getRateLimitRetryDelay(error);

      // retryAfter of 0 is falsy, so it falls through to rateLimitReset check
      expect(result).toBeUndefined();
    });

    it('should handle large retryAfter values', () => {
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        retryAfter: 3600, // 1 hour
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBe(3600000); // 3600 seconds * 1000
    });

    it('should handle rateLimitReset exactly at current time', () => {
      const now = 1640995200000;
      vi.setSystemTime(now);

      const resetTime = Math.floor(now / 1000); // Exactly now
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        rateLimitReset: resetTime,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBeUndefined(); // resetTime is not > now
    });

    it('should handle rateLimitReset 1ms in future', () => {
      const now = 1640995200000;
      vi.setSystemTime(now);

      // Set reset time to 1 second in future (minimum granularity for Unix timestamps)
      const resetTime = Math.floor(now / 1000) + 1;
      const error: GitLabAPIError = {
        error: 'Rate limited',
        status: 429,
        type: 'http',
        rateLimitReset: resetTime,
      };

      const result = getRateLimitRetryDelay(error);

      expect(result).toBe(1000); // 1 second
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete rate limit workflow', () => {
      // Simulate a complete rate limit error from Gitbeaker
      const gitbeakerError = {
        message: 'Rate limit exceeded',
        cause: {
          description: 'API rate limit exceeded',
          status: 429,
        },
        response: {
          status: 429,
          headers: {
            'retry-after': '120',
            'ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120),
          },
        },
      };

      const result = handleGitLabAPIError(gitbeakerError);

      expect(isRateLimitError(result)).toBe(true);
      expect(getRateLimitRetryDelay(result)).toBe(120000);
    });

    it('should handle Premium feature detection in code search', () => {
      const error = {
        cause: {
          description: 'Global code search is a Premium feature',
          status: 403,
        },
      };

      const result = handleGitLabAPIError(error);

      expect(result.error).toBe(GITLAB_ERROR_CODES.PREMIUM_REQUIRED.message);
      expect(result.hints).toContain(
        'This feature requires GitLab Premium or Ultimate subscription.'
      );
    });

    it('should handle auth error with helpful hints', () => {
      const error = {
        status: 401,
        message: 'Invalid personal access token',
      };

      const result = handleGitLabAPIError(error);

      expect(result.status).toBe(401);
      expect(result.hints).toBeDefined();
      expect(result.hints?.length).toBeGreaterThan(0);
    });

    it('should handle network timeout gracefully', () => {
      const error = new TypeError('fetch failed: timeout');

      const result = handleGitLabAPIError(error);

      expect(result.type).toBe('network');
      expect(result.status).toBe(0);
    });
  });
});
