import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/githubAPI.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
}));

import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';

describe('GitHub Fetch Content Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerFetchGitHubFileContentTool(mockServer.server);

    mockFetchGitHubFileContentAPI.mockResolvedValue({
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, content: 'Hello World' }),
        },
      ],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  it('should handle valid requests', async () => {
    const result = await mockServer.callTool('githubGetFileContent', {
      owner: 'test',
      repo: 'repo',
      filePath: 'README.md',
      branch: 'main',
    });

    expect(result.isError).toBe(false);
  });
});
