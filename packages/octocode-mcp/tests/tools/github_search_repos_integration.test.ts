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

    expect(responseText).toEqual(`data:
  queries:
    - reasoning: "Testing response structure"
      status: "success"
      data:
        repositories:
          - description: "A declarative, efficient, and flexible JavaScript library for building user interfaces."
            repository: "facebook/react"
            stars: 200000
            updatedAt: "15/01/2024"
            url: "https://github.com/facebook/react"
          - description: "The React Framework for Production"
            repository: "vercel/next.js"
            stars: 100000
            updatedAt: "14/01/2024"
            url: "https://github.com/vercel/next.js"
      hints:
        - "Analyze top results in depth before expanding search"
        - "Cross-reference findings across multiple sources"
        - "Prioritize via sort and analyze the top 3-5 repositories in depth"
        - "After selection, run structure view first, then scoped code search"
        - "Avoid curated list repos by using implementation-oriented keywords"
        - "Chain tools: repository search → structure view → code search → content fetch"
        - "Compare implementations across 3-5 repositories to identify best practices"
        - "Use github_view_repo_structure first to understand project layout"
        - "Start with repository search to find relevant projects, then search within them"
hints:
  - "Query results: 1 successful"
  - "Review hints below for guidance on next steps"
`);
  }, 5000);
});
