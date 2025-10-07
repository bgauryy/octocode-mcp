import { describe, it, expect } from 'vitest';
import * as githubAPI from '../../src/github/githubAPI.js';

describe('GitHub API Re-exports', () => {
  describe('Core client functions', () => {
    it('should re-export getOctokit', () => {
      expect(typeof githubAPI.getOctokit).toEqual('function');
    });

    it('should re-export OctokitWithThrottling', () => {
      expect(typeof githubAPI.OctokitWithThrottling).toEqual('function');
    });

    it('should re-export getDefaultBranch', () => {
      expect(typeof githubAPI.getDefaultBranch).toEqual('function');
    });

    it('should re-export clearCachedToken', () => {
      expect(typeof githubAPI.clearCachedToken).toEqual('function');
    });
  });

  describe('Error handling functions', () => {
    it('should re-export handleGitHubAPIError', () => {
      expect(typeof githubAPI.handleGitHubAPIError).toEqual('function');
    });

    it('should re-export generateFileAccessHints', () => {
      expect(typeof githubAPI.generateFileAccessHints).toEqual('function');
    });
  });

  describe('Query builder functions', () => {
    it('should re-export getOwnerQualifier', () => {
      expect(typeof githubAPI.getOwnerQualifier).toEqual('function');
    });

    it('should re-export buildCodeSearchQuery', () => {
      expect(typeof githubAPI.buildCodeSearchQuery).toEqual('function');
    });

    it('should re-export buildRepoSearchQuery', () => {
      expect(typeof githubAPI.buildRepoSearchQuery).toEqual('function');
    });

    it('should re-export buildPullRequestSearchQuery', () => {
      expect(typeof githubAPI.buildPullRequestSearchQuery).toEqual('function');
    });

    it('should re-export shouldUseSearchForPRs', () => {
      expect(typeof githubAPI.shouldUseSearchForPRs).toEqual('function');
    });
  });

  describe('Search operation functions', () => {
    it('should re-export searchGitHubCodeAPI', () => {
      expect(typeof githubAPI.searchGitHubCodeAPI).toEqual('function');
    });

    it('should re-export searchGitHubReposAPI', () => {
      expect(typeof githubAPI.searchGitHubReposAPI).toEqual('function');
    });

    it('should re-export searchGitHubPullRequestsAPI', () => {
      expect(typeof githubAPI.searchGitHubPullRequestsAPI).toEqual('function');
    });

    it('should re-export fetchGitHubPullRequestByNumberAPI', () => {
      expect(typeof githubAPI.fetchGitHubPullRequestByNumberAPI).toEqual(
        'function'
      );
    });

    it('should re-export transformPullRequestItemFromREST', () => {
      expect(typeof githubAPI.transformPullRequestItemFromREST).toEqual(
        'function'
      );
    });
  });

  describe('File operation functions', () => {
    it('should re-export fetchGitHubFileContentAPI', () => {
      expect(typeof githubAPI.fetchGitHubFileContentAPI).toEqual('function');
    });

    it('should re-export viewGitHubRepositoryStructureAPI', () => {
      expect(typeof githubAPI.viewGitHubRepositoryStructureAPI).toEqual(
        'function'
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain same exports as main index', async () => {
      const githubAPI = await import('../../src/github/githubAPI');

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

      const actualTypes = coreFunctions.map(
        funcName => typeof (githubAPI as Record<string, unknown>)[funcName]
      );

      expect(actualTypes).toEqual([
        'function',
        'function',
        'function',
        'function',
        'function',
        'function',
        'function',
        'function',
        'function',
        'function',
      ]);
    });

    it('should export all required functions without undefined values', async () => {
      const githubAPI = await import('../../src/github/githubAPI');
      const exportedKeys = Object.keys(githubAPI);

      const functionKeys = exportedKeys.filter(
        key => typeof (githubAPI as Record<string, unknown>)[key] === 'function'
      );

      const allAreFunctions = functionKeys.every(key => {
        const exportedValue = (githubAPI as Record<string, unknown>)[key];
        return (
          exportedValue !== undefined &&
          exportedValue !== null &&
          typeof exportedValue === 'function'
        );
      });

      expect(allAreFunctions).toEqual(true);
      expect(functionKeys.length >= 13).toEqual(true);
    });
  });
});
