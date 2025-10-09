import { describe, it, expect, vi } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/constants.js';

// Mock the GitHub API to avoid real network calls
vi.mock('../../src/github/index.js', () => ({
  searchGitHubReposAPI: vi.fn().mockResolvedValue({
    data: {
      repositories: [
        {
          repository: 'facebook/react',
          stars: 200000,
          description:
            'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
          url: 'https://github.com/facebook/react',
          updatedAt: '15/01/2024',
        },
        {
          repository: 'vercel/next.js',
          stars: 100000,
          description: 'The React Framework for Production',
          url: 'https://github.com/vercel/next.js',
          updatedAt: '14/01/2024',
        },
      ],
    },
    status: 200,
  }),
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

describe('GitHub Search Repositories Response Structure Test', () => {
  it('should return YAML response with correct structure (no total_count, forks, language)', async () => {
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

    const responseText = result.content[0]?.text as string;

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
    expect(responseText).toContain('reasoning: "Testing response structure"');
    expect(responseText).toContain('status: "hasResults"');
    expect(responseText).toContain('query:');
    expect(responseText).toContain('repositories:');
    expect(responseText).toContain('facebook/react');
    expect(responseText).toContain('vercel/next.js');
    expect(responseText).toContain('hasResultsStatusHints:');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  }, 5000);
});
