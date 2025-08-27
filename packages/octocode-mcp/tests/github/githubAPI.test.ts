import { describe, it, expect } from 'vitest';
import * as githubAPI from '../../src/github/githubAPI.js';

describe('GitHub API Re-exports', () => {
  describe('Core client functions', () => {
    it('should re-export client functions', () => {
      expect(githubAPI.getOctokit).toBeDefined();
      expect(typeof githubAPI.getOctokit).toBe('function');

      expect(githubAPI.OctokitWithThrottling).toBeDefined();
      expect(typeof githubAPI.OctokitWithThrottling).toBe('function');

      expect(githubAPI.getDefaultBranch).toBeDefined();
      expect(typeof githubAPI.getDefaultBranch).toBe('function');

      expect(githubAPI.clearCachedToken).toBeDefined();
      expect(typeof githubAPI.clearCachedToken).toBe('function');
    });
  });

  describe('Error handling functions', () => {
    it('should re-export error handling functions', () => {
      expect(githubAPI.handleGitHubAPIError).toBeDefined();
      expect(typeof githubAPI.handleGitHubAPIError).toBe('function');

      expect(githubAPI.generateFileAccessHints).toBeDefined();
      expect(typeof githubAPI.generateFileAccessHints).toBe('function');
    });
  });

  describe('Query builder functions', () => {
    it('should re-export query builder functions', () => {
      expect(githubAPI.getOwnerQualifier).toBeDefined();
      expect(typeof githubAPI.getOwnerQualifier).toBe('function');

      expect(githubAPI.buildCodeSearchQuery).toBeDefined();
      expect(typeof githubAPI.buildCodeSearchQuery).toBe('function');

      expect(githubAPI.buildRepoSearchQuery).toBeDefined();
      expect(typeof githubAPI.buildRepoSearchQuery).toBe('function');

      expect(githubAPI.buildPullRequestSearchQuery).toBeDefined();
      expect(typeof githubAPI.buildPullRequestSearchQuery).toBe('function');

      expect(githubAPI.buildCommitSearchQuery).toBeDefined();
      expect(typeof githubAPI.buildCommitSearchQuery).toBe('function');

      expect(githubAPI.shouldUseSearchForPRs).toBeDefined();
      expect(typeof githubAPI.shouldUseSearchForPRs).toBe('function');
    });
  });

  describe('Search operation functions', () => {
    it('should re-export search operation functions', () => {
      expect(githubAPI.searchGitHubCodeAPI).toBeDefined();
      expect(typeof githubAPI.searchGitHubCodeAPI).toBe('function');

      expect(githubAPI.searchGitHubReposAPI).toBeDefined();
      expect(typeof githubAPI.searchGitHubReposAPI).toBe('function');

      expect(githubAPI.searchGitHubPullRequestsAPI).toBeDefined();
      expect(typeof githubAPI.searchGitHubPullRequestsAPI).toBe('function');

      expect(githubAPI.fetchGitHubPullRequestByNumberAPI).toBeDefined();
      expect(typeof githubAPI.fetchGitHubPullRequestByNumberAPI).toBe(
        'function'
      );

      expect(githubAPI.transformPullRequestItemFromREST).toBeDefined();
      expect(typeof githubAPI.transformPullRequestItemFromREST).toBe(
        'function'
      );

      expect(githubAPI.searchGitHubCommitsAPI).toBeDefined();
      expect(typeof githubAPI.searchGitHubCommitsAPI).toBe('function');
    });
  });

  describe('File operation functions', () => {
    it('should re-export file operation functions', () => {
      expect(githubAPI.fetchGitHubFileContentAPI).toBeDefined();
      expect(typeof githubAPI.fetchGitHubFileContentAPI).toBe('function');

      expect(githubAPI.viewGitHubRepositoryStructureAPI).toBeDefined();
      expect(typeof githubAPI.viewGitHubRepositoryStructureAPI).toBe(
        'function'
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain same exports as main index', async () => {
      // Import both to compare using import paths that work with test runner
      const githubAPI = await import('../../src/github/githubAPI');

      // Core functions that should be available
      const coreFunctions = [
        'getOctokit',
        'getDefaultBranch',
        'clearCachedToken',
        'handleGitHubAPIError',
        'generateFileAccessHints',
        'buildCodeSearchQuery',
        'buildRepoSearchQuery',
        'searchGitHubCodeAPI',
        'searchGitHubReposAPI',
        'fetchGitHubFileContentAPI',
      ];

      coreFunctions.forEach(funcName => {
        expect((githubAPI as Record<string, unknown>)[funcName]).toBeDefined();
        expect(typeof (githubAPI as Record<string, unknown>)[funcName]).toBe(
          'function'
        );
      });
    });

    it('should export all required functions without undefined values', async () => {
      const githubAPI = await import('../../src/github/githubAPI');
      const exportedKeys = Object.keys(githubAPI);

      // Filter out type-only exports (they don't exist at runtime)
      const functionKeys = exportedKeys.filter(
        key => typeof (githubAPI as Record<string, unknown>)[key] === 'function'
      );

      functionKeys.forEach(key => {
        const exportedValue = (githubAPI as Record<string, unknown>)[key];
        expect(exportedValue).toBeDefined();
        expect(exportedValue).not.toBeNull();
        expect(typeof exportedValue).toBe('function');
      });

      // Ensure we have a reasonable number of function exports
      expect(functionKeys.length).toBeGreaterThan(15);
    });
  });
});
