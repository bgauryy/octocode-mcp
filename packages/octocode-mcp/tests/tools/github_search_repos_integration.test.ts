import { describe, it, expect, vi } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';
import { getTextContent } from '../utils/testHelpers.js';

// Mock the GitHub API to avoid real network calls
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(() => Promise.resolve('mock-token')),
  getServerConfig: vi.fn(() => ({
    version: '7.0.0',
    enableTools: [],
    disableTools: [],
    enableLogging: true,
    timeout: 30000,
    maxRetries: 3,
  })),
}));

import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';

describe('GitHub Search Repositories Response Structure Test', () => {
  it('should return YAML response with correct structure (no total_count, forks, language)', async () => {
    mockSearchGitHubReposAPI.mockResolvedValue({
      data: {
        repositories: [
          {
            owner: 'facebook',
            repo: 'react',
            stars: 200000,
            description:
              'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
            url: 'https://github.com/facebook/react',
            createdAt: '15/01/2024',
            updatedAt: '15/01/2024',
            pushedAt: '15/01/2024',
          },
          {
            owner: 'vercel',
            repo: 'next.js',
            stars: 100000,
            description: 'The React Framework for Production',
            url: 'https://github.com/vercel/next.js',
            createdAt: '14/01/2024',
            updatedAt: '14/01/2024',
            pushedAt: '14/01/2024',
          },
        ],
      },
      status: 200,
    });

    const mockServer = createMockMcpServer();
    registerSearchGitHubReposTool(mockServer.server);

    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      {
        queries: [
          {
            id: 'test-query',
            reasoning: 'Testing response structure',
            keywordsToSearch: ['react', 'hooks'],
            limit: 2,
          },
        ],
      }
    );

    const responseText = getTextContent(result.content);

    expect(result).toEqual({
      isError: false,
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    });

    expect(responseText).toContain('instructions:');
    expect(responseText).toContain('results:');
    expect(responseText).toContain('1 hasResults');
    // Optimized: reasoning no longer duplicated in response
    expect(responseText).toContain('status: "hasResults"');
    expect(responseText).toContain('repositories:');
    expect(responseText).toContain('facebook/react');
    expect(responseText).toContain('vercel/next.js');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  }, 5000);
});
