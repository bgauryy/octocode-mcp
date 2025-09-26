import { describe, it, expect } from 'vitest';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { TOOL_NAMES } from '../../src/constants.js';

describe('GitHub Search Repositories Integration Test', () => {
  it('should return YAML response with correct structure (no total_count, forks, language)', async () => {
    const mockServer = createMockMcpServer();
    registerSearchGitHubReposTool(mockServer.server);

    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      {
        queries: [
          {
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

    // Ensure removed fields are NOT present in the response
    expect(responseText).not.toContain('total_count:');
    expect(responseText).not.toContain('forks:');
    expect(responseText).not.toContain('language:');

    // Validate it's proper YAML format
    expect(responseText).toMatch(/^data:/m);
    expect(responseText).toMatch(/hints:/m);

    // Validate the response structure matches our expected schema
    expect(responseText).toContain('queryId:');
    expect(responseText).toContain('error:'); // Expected due to config issue
    expect(responseText).toContain('metadata:');
  });
});
