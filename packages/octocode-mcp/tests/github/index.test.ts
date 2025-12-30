import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as githubIndex from '../../src/github/index.js';

// Mock the client module to spy on clearOctokitInstances
vi.mock('../../src/github/client.js', async () => {
  const actual = await vi.importActual('../../src/github/client.js');
  return {
    ...actual,
    clearOctokitInstances: vi.fn(),
  };
});

// Mock the serverConfig module to spy on clearConfigCachedToken
vi.mock('../../src/serverConfig.js', async () => {
  const actual = await vi.importActual('../../src/serverConfig.js');
  return {
    ...actual,
    clearConfigCachedToken: vi.fn(),
  };
});

import { clearOctokitInstances } from '../../src/github/client.js';
import { clearConfigCachedToken } from '../../src/serverConfig.js';

describe('GitHub Index Exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Client exports', () => {
    it('should export client functions', () => {
      expect(githubIndex.getOctokit).toBeDefined();
      expect(typeof githubIndex.getOctokit).toBe('function');

      expect(githubIndex.OctokitWithThrottling).toBeDefined();
      expect(typeof githubIndex.OctokitWithThrottling).toBe('function');

      expect(githubIndex.clearOctokitInstances).toBeDefined();
      expect(typeof githubIndex.clearOctokitInstances).toBe('function');
      expect(githubIndex.clearAllAuthState).toBeDefined();
      expect(typeof githubIndex.clearAllAuthState).toBe('function');
    });
  });

  describe('clearAllAuthState', () => {
    it('should clear both Octokit instances and config cached token', () => {
      // Call the function
      githubIndex.clearAllAuthState();

      // Verify both underlying functions were called
      expect(clearOctokitInstances).toHaveBeenCalledTimes(1);
      expect(clearConfigCachedToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling exports', () => {
    it('should export error handling functions', () => {
      expect(githubIndex.handleGitHubAPIError).toBeDefined();
      expect(typeof githubIndex.handleGitHubAPIError).toBe('function');
    });
  });

  describe('Query builder exports', () => {
    it('should export query builder functions', () => {
      expect(githubIndex.buildCodeSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildCodeSearchQuery).toBe('function');

      expect(githubIndex.buildRepoSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildRepoSearchQuery).toBe('function');

      expect(githubIndex.buildPullRequestSearchQuery).toBeDefined();
      expect(typeof githubIndex.buildPullRequestSearchQuery).toBe('function');

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
      const exportedKeys = Object.keys(githubIndex);

      const expectedFunctions = [
        'getOctokit',
        'OctokitWithThrottling',
        'clearOctokitInstances',
        'clearAllAuthState',
        'handleGitHubAPIError',
        'buildCodeSearchQuery',
        'buildRepoSearchQuery',
        'buildPullRequestSearchQuery',
        'shouldUseSearchForPRs',
        'searchGitHubCodeAPI',
        'searchGitHubReposAPI',
        'searchGitHubPullRequestsAPI',
        'fetchGitHubPullRequestByNumberAPI',
        'transformPullRequestItemFromREST',
        'fetchGitHubFileContentAPI',
        'viewGitHubRepositoryStructureAPI',
      ];

      expect(exportedKeys.sort()).toEqual(expectedFunctions.sort());
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
        'clearOctokitInstances',
        'clearAllAuthState',
        'handleGitHubAPIError',
        'buildCodeSearchQuery',
        'buildRepoSearchQuery',
        'buildPullRequestSearchQuery',
        'shouldUseSearchForPRs',
        'searchGitHubCodeAPI',
        'searchGitHubReposAPI',
        'searchGitHubPullRequestsAPI',
        'fetchGitHubPullRequestByNumberAPI',
        'transformPullRequestItemFromREST',
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
