/**
 * Tests for tool utility functions
 * Validates hint propagation, error handling, and result creation
 */

import { describe, it, expect } from 'vitest';
import {
  createSuccessResult,
  createErrorResult,
  handleApiError,
  handleCatchError,
} from '../../src/tools/utils.js';
import type { GitHubAPIError } from '../../src/github/githubAPI.js';

describe('Tools Utils', () => {
  describe('createSuccessResult', () => {
    it('should create success result with hasResults status', () => {
      const query = {
        researchGoal: 'Find test files',
        reasoning: 'Looking for tests',
      };
      const data = { files: ['test1.ts', 'test2.ts'] };

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_CODE'
      );

      expect(result.status).toBe('hasResults');
      expect(result.researchGoal).toBe('Find test files');
      expect(result.reasoning).toBe('Looking for tests');
      expect(result.files).toEqual(['test1.ts', 'test2.ts']);
    });

    it('should create success result with empty status', () => {
      const query = {
        researchGoal: 'Find test files',
        reasoning: 'Looking for tests',
      };
      const data = { files: [] };

      const result = createSuccessResult(
        query,
        data,
        false,
        'GITHUB_SEARCH_CODE'
      );

      expect(result.status).toBe('empty');
      expect(result.researchGoal).toBe('Find test files');
      expect(result.reasoning).toBe('Looking for tests');
      expect(result.files).toEqual([]);
    });

    it('should propagate custom hints to the final result', () => {
      const query = {
        researchGoal: 'Find repositories',
        reasoning: 'Searching for repos',
      };
      const data = { repositories: ['repo1', 'repo2'] };
      const customHints = [
        'Try narrowing your search with topics',
        'Consider using stars filter',
      ];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_REPOSITORIES',
        customHints
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeDefined();
      expect(result.hints).toEqual(customHints);
      expect(result.hints).toHaveLength(2);
      expect(result.hints).toContain('Try narrowing your search with topics');
      expect(result.hints).toContain('Consider using stars filter');
    });

    it('should NOT include hints property when customHints is empty array', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const data = { files: ['file1.ts'] };
      const customHints: string[] = [];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_CODE',
        customHints
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeUndefined();
    });

    it('should NOT include hints property when customHints is undefined', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const data = { files: ['file1.ts'] };

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_CODE'
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeUndefined();
    });

    it('should propagate hints with empty status', () => {
      const query = {
        researchGoal: 'Find repositories',
        reasoning: 'Searching for repos',
      };
      const data = { repositories: [] };
      const customHints = [
        'Try broader search terms',
        'Remove filters to expand results',
      ];

      const result = createSuccessResult(
        query,
        data,
        false,
        'GITHUB_SEARCH_REPOSITORIES',
        customHints
      );

      expect(result.status).toBe('empty');
      expect(result.hints).toBeDefined();
      expect(result.hints).toEqual(customHints);
      expect(result.hints).toHaveLength(2);
    });

    it('should propagate single hint', () => {
      const query = {
        researchGoal: 'Find content',
        reasoning: 'Fetching file',
      };
      const data = { content: 'file content' };
      const customHints = ['File found successfully'];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_FETCH_CONTENT',
        customHints
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeDefined();
      expect(result.hints).toEqual(['File found successfully']);
      expect(result.hints).toHaveLength(1);
    });

    it('should propagate multiple hints', () => {
      const query = {
        researchGoal: 'Find PRs',
        reasoning: 'Searching pull requests',
      };
      const data = { pull_requests: [{ number: 1 }] };
      const customHints = [
        'First hint',
        'Second hint',
        'Third hint',
        'Fourth hint',
      ];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_PULL_REQUESTS',
        customHints
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints).toBeDefined();
      expect(result.hints).toHaveLength(4);
      expect(result.hints).toEqual(customHints);
    });

    it('should merge data properties correctly with hints', () => {
      const query = {
        researchGoal: 'Complex search',
        reasoning: 'Testing',
      };
      const data = {
        repositories: ['repo1'],
        total: 1,
        metadata: { page: 1 },
      };
      const customHints = ['Custom hint'];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_REPOSITORIES',
        customHints
      );

      expect(result.status).toBe('hasResults');
      expect(result.researchGoal).toBe('Complex search');
      expect(result.reasoning).toBe('Testing');
      expect(result.repositories).toEqual(['repo1']);
      expect(result.total).toBe(1);
      expect(result.metadata).toEqual({ page: 1 });
      expect(result.hints).toEqual(['Custom hint']);
    });
  });

  describe('createErrorResult', () => {
    it('should create error result without hints', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const error = 'API error occurred';

      const result = createErrorResult(query, error);

      expect(result.status).toBe('error');
      expect(result.error).toBe('API error occurred');
      expect(result.researchGoal).toBe('Find files');
      expect(result.reasoning).toBe('Searching');
      expect(result.hints).toBeUndefined();
    });

    it('should include hints from API error', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiError: GitHubAPIError = {
        error: 'Rate limit exceeded',
        type: 'http',
        status: 429,
        rateLimitRemaining: 0,
        rateLimitReset: Date.now() + 3600000,
      };

      const result = createErrorResult(query, 'Rate limit error', apiError);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Rate limit error');
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
      expect(result.hints!.some(h => h.includes('Rate limit'))).toBe(true);
    });

    it('should include retry after hint', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiError: GitHubAPIError = {
        error: 'Too many requests',
        type: 'http',
        status: 429,
        retryAfter: 60,
      };

      const result = createErrorResult(query, 'Too many requests', apiError);

      expect(result.status).toBe('error');
      expect(result.hints).toBeDefined();
      expect(result.hints!.some(h => h.includes('Retry after 60'))).toBe(true);
    });

    it('should include scopes suggestion hint', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiError: GitHubAPIError = {
        error: 'Insufficient permissions',
        type: 'http',
        status: 403,
        scopesSuggestion: 'Required scopes: repo, read:org',
      };

      const result = createErrorResult(query, 'Permission denied', apiError);

      expect(result.status).toBe('error');
      expect(result.hints).toBeDefined();
      expect(
        result.hints!.some(h => h.includes('Required scopes: repo, read:org'))
      ).toBe(true);
    });
  });

  describe('handleApiError', () => {
    it('should return null for non-error responses', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiResult = {
        data: { items: [] },
        status: 200,
      };

      const result = handleApiError(apiResult, query);

      expect(result).toBeNull();
    });

    it('should return error result for error responses', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiResult = {
        error: 'API error',
        type: 'http' as const,
        status: 500,
      };

      const result = handleApiError(apiResult, query);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('error');
      // The error property is the entire GitHubAPIError object
      expect(result?.error).toEqual({
        error: 'API error',
        type: 'http',
        status: 500,
        rateLimitRemaining: undefined,
        rateLimitReset: undefined,
        retryAfter: undefined,
        scopesSuggestion: undefined,
      });
    });

    it('should propagate hints from API error response', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiResult = {
        error: 'Authentication failed',
        type: 'http' as const,
        status: 401,
        hints: ['Check your GitHub token', 'Verify token permissions'],
      };

      const result = handleApiError(apiResult, query);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('error');
      expect(result?.hints).toBeDefined();
      expect(result?.hints).toContain('Check your GitHub token');
      expect(result?.hints).toContain('Verify token permissions');
    });

    it('should combine API hints with extracted error hints', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const apiResult = {
        error: 'Rate limit exceeded',
        type: 'http' as const,
        status: 429,
        rateLimitRemaining: 0,
        rateLimitReset: Date.now() + 3600000,
        hints: ['Custom API hint'],
      };

      const result = handleApiError(apiResult, query);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('error');
      expect(result?.hints).toBeDefined();
      expect(result?.hints).toContain('Custom API hint');
      expect(result?.hints!.some(h => h.includes('Rate limit'))).toBe(true);
    });
  });

  describe('handleCatchError', () => {
    it('should handle Error objects', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const error = new Error('Something went wrong');

      const result = handleCatchError(error, query);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Something went wrong');
      expect(result.researchGoal).toBe('Find files');
      expect(result.reasoning).toBe('Searching');
    });

    it('should handle Error objects with context message', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const error = new Error('Network failure');
      const contextMessage = 'Failed to fetch data';

      const result = handleCatchError(error, query, contextMessage);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Failed to fetch data: Network failure');
    });

    it('should handle unknown error types', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const error = 'String error';

      const result = handleCatchError(error, query);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Unknown error occurred');
    });

    it('should not include hints in catch errors', () => {
      const query = {
        researchGoal: 'Find files',
        reasoning: 'Searching',
      };
      const error = new Error('Test error');

      const result = handleCatchError(error, query);

      expect(result.status).toBe('error');
      expect(result.hints).toBeUndefined();
    });
  });

  describe('Integration - Hints propagation in full flow', () => {
    it('should propagate custom hints through createSuccessResult for all tool types', () => {
      const toolNames = [
        'GITHUB_SEARCH_CODE',
        'GITHUB_SEARCH_REPOSITORIES',
        'GITHUB_FETCH_CONTENT',
        'GITHUB_SEARCH_PULL_REQUESTS',
        'GITHUB_VIEW_REPO_STRUCTURE',
      ] as const;

      toolNames.forEach(toolName => {
        const query = {
          researchGoal: `Test ${toolName}`,
          reasoning: 'Testing hints',
        };
        const data = { testData: 'value' };
        const customHints = [`Hint for ${toolName}`];

        const result = createSuccessResult(
          query,
          data,
          true,
          toolName,
          customHints
        );

        expect(result.status).toBe('hasResults');
        expect(result.hints).toBeDefined();
        expect(result.hints).toEqual(customHints);
      });
    });

    it('should reference the same hints array (not create a copy)', () => {
      const query = {
        researchGoal: 'Test',
        reasoning: 'Testing',
      };
      const data = { items: [] };
      const customHints = ['Hint 1', 'Hint 2'];

      const result = createSuccessResult(
        query,
        data,
        true,
        'GITHUB_SEARCH_CODE',
        customHints
      );

      // Custom hints are included in the result (may be merged with static hints)
      expect(result.hints).toStrictEqual(customHints);
      expect(result.hints).toHaveLength(2);
      expect(result.hints).toEqual(['Hint 1', 'Hint 2']);
    });
  });
});
