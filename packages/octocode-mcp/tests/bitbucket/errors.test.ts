import { describe, it, expect } from 'vitest';
import {
  handleBitbucketAPIError,
  createBitbucketError,
  isRateLimitError,
  extractRateLimitFromHeaders,
  BITBUCKET_ERROR_CODES,
} from '../../src/bitbucket/errors.js';

describe('Bitbucket Error Handling', () => {
  describe('handleBitbucketAPIError', () => {
    it('should handle 429 rate limit errors', () => {
      const error = { status: 429 };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(429);
      expect(result.error).toContain('rate limit');
      expect(result.type).toBe('http');
    });

    it('should handle 401 unauthorized errors', () => {
      const error = { status: 401 };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(401);
      expect(result.error).toContain('authentication');
    });

    it('should handle 403 forbidden errors', () => {
      const error = { status: 403 };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Access denied');
    });

    it('should handle 404 not found errors', () => {
      const error = { status: 404 };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(404);
      expect(result.error).toContain('not found');
    });

    it('should handle 400 bad request errors', () => {
      const error = { status: 400, message: 'bad param' };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(400);
      expect(result.error).toContain('Invalid request');
    });

    it('should handle 500+ server errors', () => {
      const error = { status: 503 };
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(503);
      expect(result.error).toContain('server error');
    });

    it('should handle network fetch errors', () => {
      const error = new TypeError('fetch failed');
      const result = handleBitbucketAPIError(error);
      expect(result.status).toBe(0);
      expect(result.type).toBe('network');
    });

    it('should handle generic Error instances', () => {
      const error = new Error('something broke');
      const result = handleBitbucketAPIError(error);
      expect(result.error).toBe('something broke');
      expect(result.status).toBe(500);
      expect(result.type).toBe('unknown');
    });

    it('should handle unknown error types', () => {
      const result = handleBitbucketAPIError('string error');
      expect(result.error).toBe('An unknown error occurred');
      expect(result.status).toBe(500);
    });
  });

  describe('createBitbucketError', () => {
    it('should create error with defaults', () => {
      const result = createBitbucketError('test error');
      expect(result).toEqual({
        error: 'test error',
        status: 500,
        type: 'http',
        hints: undefined,
      });
    });

    it('should create error with custom status and hints', () => {
      const result = createBitbucketError('bad request', 400, ['hint1']);
      expect(result.status).toBe(400);
      expect('hints' in result && result.hints).toEqual(['hint1']);
    });
  });

  describe('isRateLimitError', () => {
    it('should return true for 429 status', () => {
      expect(isRateLimitError({ error: '', status: 429, type: 'http' })).toBe(
        true
      );
    });

    it('should return false for other statuses', () => {
      expect(isRateLimitError({ error: '', status: 403, type: 'http' })).toBe(
        false
      );
    });
  });

  describe('extractRateLimitFromHeaders', () => {
    it('should extract rate limit headers', () => {
      const headers = new Headers({
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '1700000000',
        'retry-after': '30',
      });

      const result = extractRateLimitFromHeaders(headers);
      expect(result.remaining).toBe(50);
      expect(result.reset).toBe(1700000000);
      expect(result.retryAfter).toBe(30);
    });

    it('should return undefined for missing headers', () => {
      const headers = new Headers();
      const result = extractRateLimitFromHeaders(headers);
      expect(result.remaining).toBeUndefined();
      expect(result.reset).toBeUndefined();
      expect(result.retryAfter).toBeUndefined();
    });
  });

  describe('BITBUCKET_ERROR_CODES', () => {
    it('should have all expected error codes', () => {
      expect(BITBUCKET_ERROR_CODES.RATE_LIMITED).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.UNAUTHORIZED).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.FORBIDDEN).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.NOT_FOUND).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.BAD_REQUEST).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.SERVER_ERROR).toBeDefined();
      expect(BITBUCKET_ERROR_CODES.NETWORK_ERROR).toBeDefined();
    });
  });
});
