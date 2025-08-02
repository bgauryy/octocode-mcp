import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/githubAPI.js', () => ({
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

import { registerViewRepositoryStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

describe('GitHub View Repository Structure Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerViewRepositoryStructureTool(mockServer.server);

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
      owner: 'test',
      repo: 'repo',
      branch: 'main',
    });

    expect(result.isError).toBe(false);
  });

  it('should handle API errors', async () => {
    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: 'Not found' }) }],
    });

    const result = await mockServer.callTool('githubViewRepoStructure', {
      owner: 'nonexistent',
      repo: 'repo',
      branch: 'main',
    });

    expect(result.isError).toBe(true);
  });

  it('should handle optional parameters', async () => {
    const result = await mockServer.callTool('githubViewRepoStructure', {
      owner: 'test',
      repo: 'repo',
      branch: 'main',
      path: 'src',
      depth: 2,
    });

    expect(result.isError).toBe(false);
  });
});
