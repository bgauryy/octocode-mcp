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

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');

    const responseText = result.content[0]?.text as string;

    // Validate YAML structure
    expect(responseText).toContain('data:');
    expect(responseText).toContain('hints:');

    // CRITICAL: Ensure removed fields are NOT present in the response (schema cleanup)
    expect(responseText).not.toContain('total_count:');
    expect(responseText).not.toContain('forks:');
    expect(responseText).not.toContain('language:');

    // Validate it's proper YAML format
    expect(responseText).toMatch(/^data:/m);
    expect(responseText).toMatch(/hints:/m);

    // Validate the response structure matches our expected schema
    expect(responseText).toContain('queryId: "test-query"');
    expect(responseText).toContain('reasoning: "Testing response structure"');

    // Validate that only expected fields are present (SimplifiedRepository interface)
    expect(responseText).toContain('repository: "facebook/react"');
    expect(responseText).toContain('stars: 200000');
    expect(responseText).toContain('repository: "vercel/next.js"');
    expect(responseText).toContain('stars: 100000');
  }, 5000);
});
