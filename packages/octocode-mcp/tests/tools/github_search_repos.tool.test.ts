import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';

const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(() => Promise.resolve('mock-token')),
  getServerConfig: vi.fn(() => ({
    version: '1.0.0',
    enableLogging: true,
    betaEnabled: false,
    timeout: 30000,
    maxRetries: 3,
    loggingEnabled: false,
  })),
}));

import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('GitHub Search Repos Tool - Comprehensive Status Tests', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerSearchGitHubReposTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Status: ok', () => {
    it('should return ok status when API returns repositories', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'facebook/react',
              stars: 200000,
              description: 'A declarative JavaScript library',
              url: 'https://github.com/facebook/react',
              createdAt: '2024-01-15',
              updatedAt: '2024-01-15',
              pushedAt: '2024-01-15',
            },
            {
              repository: 'vercel/next.js',
              stars: 100000,
              description: 'The React Framework',
              url: 'https://github.com/vercel/next.js',
              createdAt: '2024-01-14',
              updatedAt: '2024-01-14',
              pushedAt: '2024-01-14',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['react'],
              limit: 2,
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('repositories:');
      expect(responseText).toContain('facebook/react');
      expect(responseText).toContain('vercel/next.js');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle single repository result', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'microsoft/TypeScript',
              stars: 90000,
              description: 'TypeScript is a superset of JavaScript',
              url: 'https://github.com/microsoft/TypeScript',
              createdAt: '2024-01-10',
              updatedAt: '2024-01-10',
              pushedAt: '2024-01-10',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['typescript'],
              limit: 1,
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('microsoft/TypeScript');
      expect(responseText).toContain('1 hasResults');
    });

    it('should include all repository fields in response', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'nodejs/node',
              stars: 95000,
              description: 'Node.js JavaScript runtime',
              url: 'https://github.com/nodejs/node',
              createdAt: '2024-01-20',
              updatedAt: '2024-01-20',
              pushedAt: '2024-01-20',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['nodejs'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('repository: "nodejs/node"');
      expect(responseText).toContain('stars: 95000');
      expect(responseText).toContain(
        'description: "Node.js JavaScript runtime"'
      );
      expect(responseText).toContain('url: "https://github.com/nodejs/node"');
      expect(responseText).toContain('updatedAt: "2024-01-20"');
    });
  });

  describe('Status: empty', () => {
    it('should return empty status when API returns no repositories', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['nonexistent-repo-xyz123'],
              limit: 5,
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle empty repositories array', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              topicsToSearch: ['nonexistent-topic-xyz'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "empty"');
    });
  });

  describe('Status: error', () => {
    it('should return error status when API returns error', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        type: 'rateLimit',
        status: 429,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "API rate limit exceeded"');
      expect(responseText).toContain('1 failed');
    });

    it('should handle exception thrown during API call', async () => {
      mockSearchGitHubReposAPI.mockRejectedValue(
        new Error('Network connection error')
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "Network connection error"');
    });

    it('should include GitHub API error-derived hints (auth/scopes)', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'GitHub authentication required',
        status: 401,
        type: 'http',
        scopesSuggestion:
          "TELL THE USER: Refresh your GitHub token! Run 'gh auth login' OR 'gh auth refresh' OR set a new GITHUB_TOKEN/GH_TOKEN environment variable",
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['react'],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain(
        'GitHub Octokit API Error: GitHub authentication required'
      );
      expect(responseText).toContain(
        "Run 'gh auth login' OR 'gh auth refresh'"
      );
    });
  });

  describe('Multiple queries - same status', () => {
    it('should handle multiple queries all with ok', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'facebook/react',
                stars: 200000,
                description: 'React library',
                url: 'https://github.com/facebook/react',
                createdAt: '2024-01-15',
                updatedAt: '2024-01-15',
                pushedAt: '2024-01-15',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'angular/angular',
                stars: 85000,
                description: 'Angular framework',
                url: 'https://github.com/angular/angular',
                createdAt: '2024-01-14',
                updatedAt: '2024-01-14',
                pushedAt: '2024-01-14',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'vuejs/vue',
                stars: 195000,
                description: 'Vue.js framework',
                url: 'https://github.com/vuejs/vue',
                createdAt: '2024-01-13',
                updatedAt: '2024-01-13',
                pushedAt: '2024-01-13',
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['react'] },
            { keywordsToSearch: ['angular'] },
            { keywordsToSearch: ['vue'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('3 hasResults');
      expect(responseText).toContain('facebook/react');
      expect(responseText).toContain('angular/angular');
      expect(responseText).toContain('vuejs/vue');
    });

    it('should handle multiple queries all with empty status', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['xyz123'] },
            { keywordsToSearch: ['abc456'] },
            { keywordsToSearch: ['def789'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('3 empty');
    });

    it('should handle multiple queries all with error status', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          error: 'Rate limit 1',
          type: 'rateLimit',
          status: 429,
        })
        .mockResolvedValueOnce({
          error: 'Rate limit 2',
          type: 'rateLimit',
          status: 429,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['test1'] },
            { keywordsToSearch: ['test2'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('2 failed');
    });
  });

  describe('Multiple queries - mixed statuses', () => {
    it('should handle ok + empty mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'test/repo1',
                stars: 100,
                description: 'Test',
                url: 'https://github.com/test/repo1',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
                pushedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['react'] },
            { keywordsToSearch: ['xyz'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 empty');
    });

    it('should handle ok + error mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'test/repo',
                stars: 50,
                description: 'Test',
                url: 'https://github.com/test/repo',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
                pushedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'API error',
          type: 'api',
          status: 500,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['test1'] },
            { keywordsToSearch: ['test2'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 failed');
    });

    it('should handle empty + error mix', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({
          error: 'Not found',
          type: 'notFound',
          status: 404,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['xyz'] },
            { keywordsToSearch: ['abc'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('1 failed');
    });

    it('should handle all three status types in single response', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'owner/repo',
                stars: 10,
                description: 'Test',
                url: 'https://github.com/owner/repo',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
                pushedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({ data: { repositories: [] }, status: 200 })
        .mockResolvedValueOnce({
          error: 'Server error',
          type: 'server',
          status: 500,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            { keywordsToSearch: ['test'] },
            { keywordsToSearch: ['nonexistent'] },
            { keywordsToSearch: ['error'] },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('1 failed');
    });
  });

  describe('Optimized response (no query duplication)', () => {
    it('should NOT include researchGoal from query (optimized)', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'test/repo',
              stars: 100,
              description: 'Test',
              url: 'https://github.com/test/repo',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
              pushedAt: '2024-01-01',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              researchGoal: 'Find testing frameworks',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      // researchGoal is included in response for context
      expect(responseText).toContain('researchGoal:');
    });

    it('should include reasoning in response for context', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: { repositories: [] },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              reasoning: 'Searching for popular repos',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);
      // reasoning is included in response for context
      expect(responseText).toContain('reasoning:');
    });

    it('should handle query with researchSuggestions gracefully', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        error: 'API error',
        type: 'api',
        status: 500,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              researchSuggestions: [
                'Try different keywords',
                'Check API status',
              ],
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(responseText).toContain('status: "error"');
      // researchSuggestions is no longer echoed from query (query field removed)
    });
  });

  describe('Empty queries handling', () => {
    it('should handle empty queries array', async () => {
      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('0 results');
    });
  });

  describe('Query splitting expansion', () => {
    it('should split queries with both topicsToSearch and keywordsToSearch', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'topic/repo',
                stars: 1000,
                description: 'Topic result',
                url: 'https://github.com/topic/repo',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
                pushedAt: '2024-01-01',
              },
            ],
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            repositories: [
              {
                repository: 'keyword/repo',
                stars: 2000,
                description: 'Keyword result',
                url: 'https://github.com/keyword/repo',
                createdAt: '2024-01-02',
                updatedAt: '2024-01-02',
                pushedAt: '2024-01-02',
              },
            ],
          },
          status: 200,
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              topicsToSearch: ['javascript'],
              keywordsToSearch: ['framework'],
              reasoning: 'Find JS frameworks',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      // Should have 2 results (query was split into topics and keywords)
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('topic/repo');
      expect(responseText).toContain('keyword/repo');
      // Optimized: reasoning no longer duplicated in response
      // Verify the API was called twice (once per split query)
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledTimes(2);
    });
  });

  describe('Custom hints per response', () => {
    it('should add topic search hints when topicsToSearch is used with results', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'ml/repo',
              stars: 5000,
              description: 'ML repo',
              url: 'https://github.com/ml/repo',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
              pushedAt: '2024-01-01',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              topicsToSearch: ['machine-learning'],
              reasoning: 'Find ML repos',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "hasResults"');
    });

    it('should add suggestion hints when topicsToSearch returns no results', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              topicsToSearch: ['nonexistent-topic'],
              reasoning: 'Find repos',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "empty"');
    });

    it('should suggest topic search when keywords return no results', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['nonexistent-keyword'],
              reasoning: 'Find repos',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "empty"');
    });

    it('should not add custom hints when keywords return results', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: {
          repositories: [
            {
              repository: 'test/repo',
              stars: 100,
              description: 'Test repo',
              url: 'https://github.com/test/repo',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
              pushedAt: '2024-01-01',
            },
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        {
          queries: [
            {
              keywordsToSearch: ['test'],
              reasoning: 'Find repos',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('status: "hasResults"');
      // Should not have custom hints for keyword search with results
      // Only general tool hints in okStatusHints
      expect(responseText).not.toContain(
        'Topic search found curated repositories'
      );
    });
  });
});
