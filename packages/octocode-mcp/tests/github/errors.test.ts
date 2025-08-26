import { describe, it, expect } from 'vitest';
import { RequestError } from 'octokit';
import {
  handleGitHubAPIError,
  generateFileAccessHints,
} from '../../src/github/errors.js';

describe('GitHub Error Handling', () => {
  describe('handleGitHubAPIError', () => {
    it('should handle 401 authentication error', () => {
      const error = new RequestError('Authentication required', 401, {
        response: {
          status: 401,
          headers: {},
          data: {},
          url: 'https://api.github.com',
          retryCount: 0,
        },
        request: {
          method: 'GET',
          url: 'https://api.github.com',
          headers: {},
        },
      });

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'GitHub authentication required',
        status: 401,
        type: 'http',
        scopesSuggestion: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
      });
    });

    it('should handle 403 rate limit error', () => {
      const error = new RequestError('Rate limit exceeded', 403, {
        response: {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1640995200',
          },
          data: {},
          url: 'https://api.github.com',
          retryCount: 0,
        },
        request: {
          method: 'GET',
          url: 'https://api.github.com',
          headers: {},
        },
      });

      const result = handleGitHubAPIError(error);
      const resetTime = new Date(1640995200 * 1000).getTime();

      expect(result).toEqual({
        error: 'GitHub API rate limit exceeded',
        status: 403,
        type: 'http',
        rateLimitRemaining: 0,
        rateLimitReset: resetTime,
        retryAfter: expect.any(Number),
        scopesSuggestion:
          'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
      });
    });

    it('should handle 403 permissions error with scope suggestions', () => {
      const error = new RequestError('Forbidden', 403, {
        response: {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '5000',
            'x-accepted-oauth-scopes': 'repo, read:org',
            'x-oauth-scopes': 'read:user',
          },
          data: {},
          url: 'https://api.github.com',
          retryCount: 0,
        },
        request: {
          method: 'GET',
          url: 'https://api.github.com',
          headers: {},
        },
      });

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Access forbidden - insufficient permissions',
        status: 403,
        type: 'http',
        scopesSuggestion:
          'Missing required scopes: repo, read:org. Run: gh auth refresh -s repo -s read:org',
      });
    });

    it('should handle 404 not found error', () => {
      const error = new RequestError('Not Found', 404, {
        response: {
          status: 404,
          headers: {},
          data: {},
          url: 'https://api.github.com',
          retryCount: 0,
        },
        request: {
          method: 'GET',
          url: 'https://api.github.com',
          headers: {},
        },
      });

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Repository, resource, or path not found',
        status: 404,
        type: 'http',
      });
    });

    it('should handle 422 validation error', () => {
      const error = new RequestError('Validation Failed', 422, {
        response: {
          status: 422,
          headers: {},
          data: {},
          url: 'https://api.github.com',
          retryCount: 0,
        },
        request: {
          method: 'GET',
          url: 'https://api.github.com',
          headers: {},
        },
      });

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Invalid search query or request parameters',
        status: 422,
        type: 'http',
        scopesSuggestion: 'Check search syntax and parameter values',
      });
    });

    it('should handle network connection errors', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.github.com');

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Network connection failed',
        type: 'network',
        scopesSuggestion: 'Check internet connection and GitHub API status',
      });
    });

    it('should handle timeout errors', () => {
      const error = new Error('Request timeout exceeded');

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Request timeout',
        type: 'network',
        scopesSuggestion: 'Retry the request or check network connectivity',
      });
    });

    it('should handle generic Error objects', () => {
      const error = new Error('Something went wrong');

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Something went wrong',
        type: 'unknown',
      });
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';

      const result = handleGitHubAPIError(error);

      expect(result).toEqual({
        error: 'Unknown error occurred',
        type: 'unknown',
      });
    });

    it('should handle null/undefined errors', () => {
      const result = handleGitHubAPIError(null);

      expect(result).toEqual({
        error: 'Unknown error occurred',
        type: 'unknown',
      });
    });
  });

  describe('generateFileAccessHints', () => {
    it('should generate hints for 404 errors with default branch suggestion', () => {
      const hints = generateFileAccessHints(
        'owner',
        'repo',
        'src/file.js',
        'feature-branch',
        'main',
        'File not found (404)'
      );

      expect(hints).toEqual([
        'Try the default branch "main" instead of "feature-branch"',
        'Use githubViewRepoStructure to verify the file path "src/file.js" exists in owner/repo',
        'Use githubSearchCode to find similar files if "src/file.js" has changed or moved',
        'Try common branches: master, develop',
      ]);
    });

    it('should generate hints for 404 errors without default branch', () => {
      const hints = generateFileAccessHints(
        'owner',
        'repo',
        'src/file.js',
        'main',
        null,
        'File not found (404)'
      );

      expect(hints).toEqual([
        'Use githubViewRepoStructure to verify the file path "src/file.js" exists in owner/repo',
        'Use githubSearchCode to find similar files if "src/file.js" has changed or moved',
        'Try common branches: master, develop',
      ]);
    });

    it('should generate hints for 403 permission errors', () => {
      const hints = generateFileAccessHints(
        'owner',
        'private-repo',
        'src/file.js',
        'main',
        'main',
        'Access denied (403)'
      );

      expect(hints).toEqual([
        'Repository owner/private-repo may be private - ensure GITHUB_TOKEN is set',
        'Check if you have access permissions to this repository',
      ]);
    });

    it('should generate hints for rate limit errors', () => {
      const hints = generateFileAccessHints(
        'owner',
        'repo',
        'src/file.js',
        'main',
        'main',
        'GitHub API rate limit exceeded'
      );

      expect(hints).toEqual([
        'GitHub API rate limit exceeded - wait before retrying',
        'Set GITHUB_TOKEN environment variable for higher rate limits',
      ]);
    });

    it('should return empty hints for unknown errors', () => {
      const hints = generateFileAccessHints(
        'owner',
        'repo',
        'src/file.js',
        'main',
        'main',
        'Unknown error occurred'
      );

      expect(hints).toEqual([]);
    });
  });
});
