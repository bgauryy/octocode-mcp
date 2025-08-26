import { describe, it, expect } from 'vitest';
import * as githubIndex from '../../src/github/index.js';

describe('GitHub Index Exports', () => {
  describe('Client exports', () => {
    it('should export client functions', () => {
      expect(githubIndex.getOctokit).toBeDefined();
      expect(typeof githubIndex.getOctokit).toBe('function');

      expect(githubIndex.OctokitWithThrottling).toBeDefined();
      expect(typeof githubIndex.OctokitWithThrottling).toBe('function');

      expect(githubIndex.getDefaultBranch).toBeDefined();
      expect(typeof githubIndex.getDefaultBranch).toBe('function');

      expect(githubIndex.clearCachedToken).toBeDefined();
      expect(typeof githubIndex.clearCachedToken).toBe('function');
    });
  });

  describe('Error handling exports', () => {
    it('should export error handling functions', () => {
      expect(githubIndex.handleGitHubAPIError).toBeDefined();
      expect(typeof githubIndex.handleGitHubAPIError).toBe('function');

      expect(githubIndex.generateFileAccessHints).toBeDefined();
      expect(typeof githubIndex.generateFileAccessHints).toBe('function');
    });
  });

  describe('Query builder exports', () => {
    it('should export query builder functions', () => {
      expect(githubIndex.getOwnerQualifier).toBeDefined();
      expect(typeof githubIndex.getOwnerQualifier).toBe('function');

      expect(githubIndex.buildCodeSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildCodeSearchQuery).toBe('function');

      expect(githubIndex.buildRepoSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildRepoSearchQuery).toBe('function');

      expect(githubIndex.buildPullRequestSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildPullRequestSearchQuery).toBe('function');

      expect(githubIndex.buildCommitSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildCommitSearchQuery).toBe('function');

      expect(githubIndex.shouldUseSearchForPRs).toBeDefined();
      expect(typeof githubIndex.shouldUseSearchForPRs).toBe('function');
    });
  });

  describe('Search operation exports', () => {
    it('should export search functions', () => {
      expect(githubIndex.searchGitHubCodeAPI).toBeDefined();
      expect(typeof githubIndex.searchGitHubCodeAPI).toBe('function');

      expect(githubIndex.searchGitHubReposAPI).toBeDefined();
      expect(typeof githubIndex.searchGitHubReposAPI).toBe('function');

      expect(githubIndex.searchGitHubPullRequestsAPI).toBeDefined();
      expect(typeof githubIndex.searchGitHubPullRequestsAPI).toBe('function');

      expect(githubIndex.fetchGitHubPullRequestByNumberAPI).toBeDefined();
      expect(typeof githubIndex.fetchGitHubPullRequestByNumberAPI).toBe(
        'function'
      );

      expect(githubIndex.transformPullRequestItemFromREST).toBeDefined();
      expect(typeof githubIndex.transformPullRequestItemFromREST).toBe(
        'function'
      );

      expect(githubIndex.searchGitHubCommitsAPI).toBeDefined();
      expect(typeof githubIndex.searchGitHubCommitsAPI).toBe('function');
    });
  });

  describe('File operation exports', () => {
    it('should export file operation functions', () => {
      expect(githubIndex.fetchGitHubFileContentAPI).toBeDefined();
      expect(typeof githubIndex.fetchGitHubFileContentAPI).toBe('function');

      expect(githubIndex.viewGitHubRepositoryStructureAPI).toBeDefined();
      expect(typeof githubIndex.viewGitHubRepositoryStructureAPI).toBe(
        'function'
      );
    });
  });

  describe('Type exports', () => {
    it('should provide type exports (runtime check for module structure)', () => {
      // Since TypeScript types don't exist at runtime, we test the module structure
      const exportedKeys = Object.keys(githubIndex);

      // Ensure we have the key functions exported
      const expectedFunctions = [
        'getOctokit',
        'OctokitWithThrottling',
        'getDefaultBranch',
        'clearCachedToken',
        'handleGitHubAPIError',
        'generateFileAccessHints',
        'getOwnerQualifier',
        'buildCodeSearchQuery',
        'buildRepoSearchQuery',
        'buildPullRequestSearchQuery',
        'buildCommitSearchQuery',
        'shouldUseSearchForPRs',
        'searchGitHubCodeAPI',
        'searchGitHubReposAPI',
        'searchGitHubPullRequestsAPI',
        'fetchGitHubPullRequestByNumberAPI',
        'transformPullRequestItemFromREST',
        'searchGitHubCommitsAPI',
        'fetchGitHubFileContentAPI',
        'viewGitHubRepositoryStructureAPI',
      ];

      expectedFunctions.forEach(funcName => {
        expect(exportedKeys).toContain(funcName);
      });
    });
  });

  describe('Export consistency', () => {
    it('should export all functions without undefined values', () => {
      const exportedKeys = Object.keys(githubIndex);

      exportedKeys.forEach(key => {
        const exportedValue = (githubIndex as Record<string, unknown>)[key];
        expect(exportedValue).toBeDefined();
        expect(exportedValue).not.toBeNull();
      });
    });

    it('should have consistent function exports', () => {
      // Test that all exported functions are actually functions
      const functionExports = [
        'getOctokit',
        'getDefaultBranch',
        'clearCachedToken',
        'handleGitHubAPIError',
        'generateFileAccessHints',
        'getOwnerQualifier',
        'buildCodeSearchQuery',
        'buildRepoSearchQuery',
        'buildPullRequestSearchQuery',
        'buildCommitSearchQuery',
        'shouldUseSearchForPRs',
        'searchGitHubCodeAPI',
        'searchGitHubReposAPI',
        'searchGitHubPullRequestsAPI',
        'fetchGitHubPullRequestByNumberAPI',
        'transformPullRequestItemFromREST',
        'searchGitHubCommitsAPI',
        'fetchGitHubFileContentAPI',
        'viewGitHubRepositoryStructureAPI',
      ];

      functionExports.forEach(funcName => {
        expect(typeof (githubIndex as Record<string, unknown>)[funcName]).toBe(
          'function'
        );
      });
    });

    it('should have consistent class exports', () => {
      // Test that classes are exported correctly
      expect(typeof githubIndex.OctokitWithThrottling).toBe('function');
      // Constructor functions should be callable with 'new'
      expect(
        () =>
          new (githubIndex.OctokitWithThrottling as unknown as new () => unknown)()
      ).not.toThrow();
    });
  });
});
