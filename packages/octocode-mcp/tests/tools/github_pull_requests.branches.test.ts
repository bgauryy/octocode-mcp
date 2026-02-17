/**
 * Branch coverage tests for GitHub Pull Requests tool
 * Targets specific uncovered branches to increase coverage from 91.51% to 92%+
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';
import { getOctokit } from '../../src/github/client.js';

const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetGitHubToken = vi.hoisted(() => vi.fn());

vi.mock('../../src/providers/factory.js', () => ({
  getProvider: mockGetProvider,
}));

const mockWithCache = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/http/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
  clearAllCache: vi.fn(),
}));

vi.mock('../../src/tools/utils/tokenManager.js', () => ({
  getGitHubToken: mockGetGitHubToken,
}));

vi.mock('../../src/github/client.js');

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: mockGetGitHubToken,
  getActiveProviderConfig: vi.fn(() => ({
    provider: 'github',
    baseUrl: undefined,
    token: 'mock-token',
  })),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests/github_search_pull_requests.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('GitHub Pull Requests Tool - Branch Coverage', () => {
  let mockServer: MockMcpServer;
  let mockProvider: {
    searchCode: ReturnType<typeof vi.fn>;
    getFileContent: ReturnType<typeof vi.fn>;
    searchRepos: ReturnType<typeof vi.fn>;
    searchPullRequests: ReturnType<typeof vi.fn>;
    getRepoStructure: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockServer = createMockMcpServer();

    mockProvider = {
      searchCode: vi.fn(),
      getFileContent: vi.fn(),
      searchRepos: vi.fn(),
      searchPullRequests: vi.fn(),
      getRepoStructure: vi.fn(),
    };
    mockGetProvider.mockReturnValue(mockProvider);

    registerSearchGitHubPullRequestsTool(mockServer.server);
    vi.clearAllMocks();
    mockGetProvider.mockReturnValue(mockProvider);
    mockGetGitHubToken.mockResolvedValue('test-token');
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Validation Error Handling', () => {
    describe('Query length validation (lines 80-81)', () => {
      it('should add validation error when query exceeds 256 characters', async () => {
        const longQuery = 'a'.repeat(257); // 257 characters, exceeds limit

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                query: longQuery,
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('Query too long');
        expect(responseText).toContain('Maximum 256 characters allowed');
        // Verify provider was not called due to validation error
        expect(mockProvider.searchPullRequests).not.toHaveBeenCalled();
      });

      it('should add validation error to correct query when multiple queries provided', async () => {
        const longQuery = 'b'.repeat(300); // Exceeds limit
        mockProvider.searchPullRequests.mockResolvedValue({
          data: {
            items: [],
            totalCount: 0,
            pagination: { currentPage: 1, totalPages: 0, hasMore: false },
          },
          status: 200,
          provider: 'github',
        });

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                query: 'valid query',
              },
              {
                owner: 'test2',
                repo: 'repo2',
                query: longQuery, // This one exceeds limit
              },
            ],
          }
        );

        expect(result.isError).toBe(false);
        const responseText = getTextContent(result.content);
        // Should contain validation error for the long query
        expect(responseText).toContain('Query too long');
      });
    });

    describe('Missing search params validation (lines 88-89)', () => {
      it('should add validation error when no queries have valid search params', async () => {
        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                // No owner, repo, author, assignee, prNumber, or query
                state: 'open', // State alone is not enough
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('At least one valid search parameter');
        expect(responseText).toContain('is required');
        // Verify provider was not called due to validation error
        expect(mockProvider.searchPullRequests).not.toHaveBeenCalled();
      });

      it('should add validation error to first query when multiple queries lack valid params', async () => {
        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                // No valid params
                state: 'open',
              },
              {
                // Also no valid params
                merged: false,
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('At least one valid search parameter');
      });

      it('should not add validation error when query has valid search params', async () => {
        mockProvider.searchPullRequests.mockResolvedValue({
          data: {
            items: [],
            totalCount: 0,
            pagination: { currentPage: 1, totalPages: 0, hasMore: false },
          },
          status: 200,
          provider: 'github',
        });

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
              },
            ],
          }
        );

        expect(result.isError).toBe(false);
        const responseText = getTextContent(result.content);
        expect(responseText).not.toContain(
          'At least one valid search parameter'
        );
        expect(mockProvider.searchPullRequests).toHaveBeenCalled();
      });
    });

    describe('addValidationError function (line 37)', () => {
      it('should add _validationError property to query object', async () => {
        const longQuery = 'c'.repeat(300);

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                query: longQuery,
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        // The validation error should be in the response
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('Query too long');
      });
    });
  });

  describe('Execution Error Handling', () => {
    describe('_validationError check in execution (line 31)', () => {
      it('should return error result when query has _validationError', async () => {
        // This test verifies that execution.ts line 31 is hit
        // We need to trigger the validation error path which adds _validationError
        const longQuery = 'd'.repeat(300);

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                query: longQuery,
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        // Should return error result (not call provider)
        expect(responseText).toContain('Query too long');
        expect(mockProvider.searchPullRequests).not.toHaveBeenCalled();
      });
    });

    describe('Try/catch error handling (line 131)', () => {
      it('should catch and handle errors thrown during execution', async () => {
        // Mock provider to throw an error
        mockProvider.searchPullRequests.mockRejectedValue(
          new Error('Unexpected provider error')
        );

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                state: 'open',
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        // Should handle the error gracefully
        expect(responseText).toContain('error');
      });

      it('should handle errors when getProvider throws', async () => {
        // Mock getProvider to throw
        mockGetProvider.mockImplementation(() => {
          throw new Error('Provider initialization failed');
        });

        const result = await mockServer.callTool(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            queries: [
              {
                owner: 'test',
                repo: 'repo',
                state: 'open',
              },
            ],
          }
        );

        expect(result.isError).toBe(true);
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('error');
      });
    });
  });

  describe('PR Content Fetcher Error Handling', () => {
    describe('fetchCommitFilesAPI catch block (line 234)', () => {
      it('should handle getCommit errors gracefully by returning null', async () => {
        // This test targets line 234 in prContentFetcher.ts where fetchCommitFilesAPI
        // catches errors from octokit.rest.repos.getCommit and returns null.
        // We test this by directly calling transformPullRequestItemFromREST
        // which internally calls fetchPRCommitsWithFiles -> fetchCommitFilesAPI.

        const { transformPullRequestItemFromREST } =
          await import('../../src/github/prContentFetcher.js');

        const getCommitMock = vi
          .fn()
          .mockRejectedValue(new Error('Failed to fetch commit'));

        const mockOctokit = {
          rest: {
            pulls: {
              listCommits: vi.fn().mockResolvedValue({
                data: [
                  {
                    sha: 'commit-sha-1',
                    commit: {
                      message: 'Test commit',
                      author: {
                        name: 'Test Author',
                        date: '2023-01-01T00:00:00Z',
                      },
                    },
                  },
                ],
              }),
            },
            repos: {
              getCommit: getCommitMock,
            },
          },
        };

        vi.mocked(getOctokit).mockResolvedValue(
          mockOctokit as unknown as Awaited<ReturnType<typeof getOctokit>>
        );

        const prItem = {
          number: 123,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'testuser' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          closed_at: null,
          merged_at: null,
          html_url: 'https://github.com/test/repo/pull/123',
          head: { ref: 'feature', sha: 'head-sha' },
          base: { ref: 'main', sha: 'base-sha' },
          additions: 10,
          deletions: 5,
          changed_files: 2,
        };

        const result = await transformPullRequestItemFromREST(
          prItem as any,
          {
            owner: 'test',
            repo: 'repo',
            withCommits: true, // Triggers fetchPRCommitsWithFiles -> fetchCommitFilesAPI
          },
          mockOctokit as any,
          undefined
        );

        // Verify that getCommit was called (it will throw, and line 234 catch handles it)
        expect(getCommitMock).toHaveBeenCalled();
        expect(getCommitMock).toHaveBeenCalledWith({
          owner: 'test',
          repo: 'repo',
          ref: 'commit-sha-1',
        });

        // Verify the result has commits (even if files are empty due to error)
        expect(result).toBeDefined();
        // The error is caught by line 234 and fetchCommitFilesAPI returns null,
        // resulting in commits with empty files arrays
      });
    });
  });
});
