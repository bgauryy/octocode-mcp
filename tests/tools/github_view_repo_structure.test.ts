import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/githubAPI.js', () => ({
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

import { registerViewGitHubRepoStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

describe('GitHub View Repository Structure Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerViewGitHubRepoStructureTool(mockServer.server, {
      ghToken: 'test-token',
      npmEnabled: false,
    });

    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, files: [], folders: [] }),
        },
      ],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  it('should handle valid requests', async () => {
    const result = await mockServer.callTool('githubViewRepoStructure', {
      queries: [
        {
          owner: 'test',
          repo: 'repo',
          branch: 'main',
        },
      ],
    });

    expect(result.isError).toBe(false);
  });

  it('should handle API errors', async () => {
    // Mock the API to return an error
    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      error: 'Repository not found or access denied',
      status: 404,
      type: 'http',
    });

    const result = await mockServer.callTool('githubViewRepoStructure', {
      queries: [
        {
          owner: 'nonexistent',
          repo: 'repo',
          branch: 'main',
        },
      ],
    });

    // With bulk operations, errors are handled gracefully and returned as data with hints
    expect(result.isError).toBe(false);
    const response = JSON.parse(result.content[0]?.text as string);
    expect(response.hints).toBeDefined();
    expect(response.hints.length).toBeGreaterThan(0);
  });

  it('should handle optional parameters', async () => {
    const result = await mockServer.callTool('githubViewRepoStructure', {
      queries: [
        {
          owner: 'test',
          repo: 'repo',
          branch: 'main',
          path: 'src',
          depth: 2,
        },
      ],
    });

    expect(result.isError).toBe(false);
  });
});
