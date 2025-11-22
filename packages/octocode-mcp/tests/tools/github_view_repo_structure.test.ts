import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';
import { getTextContent } from '../utils/testHelpers.js';

const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

const mockGetOctokit = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      rest: {
        repos: {
          getContent: vi.fn(),
          get: vi.fn(),
        },
      },
    })
  )
);

vi.mock('../../src/github/fileOperations.js', () => ({
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

vi.mock('../../src/github/client.js', () => ({
  getOctokit: mockGetOctokit,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  getGitHubToken: vi.fn(async () => 'test-token'),
  getServerConfig: vi.fn(() => ({
    timeout: 30000,
    version: '1.0.0',
  })),
}));

import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
import { TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('GitHub View Repository Structure Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
    registerViewGitHubRepoStructureTool(mockServer.server);

    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      files: [
        { path: '/README.md', size: 1024 },
        { path: '/package.json', size: 512 },
      ],
      folders: {
        folders: [{ path: '/src' }, { path: '/tests' }],
      },
      summary: {
        totalFiles: 2,
        totalFolders: 2,
      },
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  it('should handle valid requests', async () => {
    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
          },
        ],
      }
    );

    expect(result.isError).toBe(false);
    const responseText = getTextContent(result.content);
    expect(responseText).toContain('instructions:');
    expect(responseText).toContain('results:');
    expect(responseText).toContain('1 hasResults');
    expect(responseText).toContain('status: "hasResults"');
    expect(responseText).toContain('query:');
    expect(responseText).toContain('owner: "test"');
    expect(responseText).toContain('repo: "repo"');
    expect(responseText).toContain('path: "/"');
    expect(responseText).toContain('files:');
    expect(responseText).toContain('folders:');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  });

  it('should pass authInfo and sessionId to GitHub API', async () => {
    // Mock successful API response
    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      files: [
        {
          path: 'README.md',
          size: 1024,
          type: 'file',
        },
      ],
      folders: [
        {
          path: 'src',
          type: 'dir',
        },
      ],
      summary: {
        totalFiles: 1,
        totalDirectories: 1,
      },
    });

    await mockServer.callTool(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      {
        queries: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            branch: 'main',
            id: 'structure-auth-test',
          },
        ],
      },
      {
        authInfo: { token: 'mock-test-token' },
        sessionId: 'test-session-id',
      }
    );

    // Verify the API was called with authInfo and sessionId
    expect(mockViewGitHubRepositoryStructureAPI).toHaveBeenCalledTimes(1);
    const apiCall = mockViewGitHubRepositoryStructureAPI.mock.calls[0];

    // Should be called with (apiRequest, authInfo, sessionId)
    expect(apiCall).toBeDefined();
    expect(apiCall).toHaveLength(3);
    expect(apiCall?.[1]).toEqual({ token: 'mock-test-token' }); // authInfo
    expect(apiCall?.[2]).toBe('test-session-id'); // sessionId
  });

  it('should handle API errors', async () => {
    // Mock the API to return an error
    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      error: 'Repository not found or access denied',
      status: 404,
      type: 'http',
    });

    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      {
        queries: [
          {
            owner: 'nonexistent',
            repo: 'repo',
            branch: 'main',
          },
        ],
      }
    );

    // With bulk operations, errors are handled gracefully and returned as data with hints
    const responseText = getTextContent(result.content);

    expect(result.isError).toBe(false);
    expect(responseText).toContain('instructions:');
    expect(responseText).toContain('results:');
    expect(responseText).toContain('1 failed');
    expect(responseText).toContain('status: "error"');
    expect(responseText).toContain(
      'error: "Repository not found or access denied"'
    );
    expect(responseText).toContain('query:');
    expect(responseText).toContain('owner: "nonexistent"');
    expect(responseText).toContain('repo: "repo"');
    expect(responseText).toContain('branch: "main"');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  });

  it('should include GitHub API error-derived hints (not found)', async () => {
    mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
      error: 'Repository, resource, or path not found',
      status: 404,
      type: 'http',
    });

    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      {
        queries: [
          {
            owner: 'missing',
            repo: 'repo',
            branch: 'main',
          },
        ],
      }
    );

    const responseText = getTextContent(result.content);
    expect(result.isError).toBe(false);
    expect(responseText).toContain('status: "error"');
    expect(responseText).toContain(
      'GitHub Octokit API Error: Repository, resource, or path not found'
    );
  });

  it('should handle optional parameters', async () => {
    const result = await mockServer.callTool(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            path: 'src',
            depth: 2,
          },
        ],
      }
    );

    expect(result.isError).toBe(false);
    const responseText = getTextContent(result.content);
    expect(responseText).toContain('instructions:');
    expect(responseText).toContain('results:');
    expect(responseText).toContain('1 hasResults');
    expect(responseText).toContain('status: "hasResults"');
    expect(responseText).toContain('query:');
    expect(responseText).toContain('owner: "test"');
    expect(responseText).toContain('repo: "repo"');
    expect(responseText).toContain('path: "src"');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  });

  describe('New Features Tests', () => {
    it('should remove path prefix from files and folders for subdirectory paths', async () => {
      // Mock API response with files and folders that have the path prefix
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [
          { path: '/contextapp/.gitignore', size: 100 },
          { path: '/contextapp/package.json', size: 500 },
          { path: '/contextapp/src/App.js', size: 1200 },
          { path: '/contextapp/src/index.js', size: 800 },
        ],
        folders: {
          folders: [
            { path: '/contextapp/src' },
            { path: '/contextapp/public' },
            { path: '/contextapp/src/components' },
          ],
        },
        summary: {
          totalFiles: 4,
          totalFolders: 3,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'iamshaunjp',
              repo: 'react-context-hooks',
              branch: 'main',
              path: '/contextapp',
              id: 'contextapp-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // Verify the path prefix is removed from files
      expect(responseText).toContain('/.gitignore');
      expect(responseText).toContain('/package.json');
      expect(responseText).toContain('/src/App.js');
      expect(responseText).toContain('/src/index.js');

      // Verify the path prefix is removed from folders
      expect(responseText).toContain('/src');
      expect(responseText).toContain('/public');
      expect(responseText).toContain('/src/components');

      // Verify the original path prefixes are NOT present
      expect(responseText).not.toContain('/contextapp/.gitignore');
      expect(responseText).not.toContain('/contextapp/package.json');
      expect(responseText).not.toContain('/contextapp/src/App.js');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle root path without removing prefixes', async () => {
      // Mock API response for root directory
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [
          { path: '/.gitignore', size: 100 },
          { path: '/package.json', size: 500 },
          { path: '/README.md', size: 1200 },
        ],
        folders: {
          folders: [{ path: '/src' }, { path: '/public' }, { path: '/docs' }],
        },
        summary: {
          totalFiles: 3,
          totalFolders: 3,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'facebook',
              repo: 'react',
              branch: 'main',
              path: '/',
              id: 'root-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // For root path, files and folders should keep their absolute paths
      expect(responseText).toContain('/.gitignore');
      expect(responseText).toContain('/package.json');
      expect(responseText).toContain('/README.md');
      expect(responseText).toContain('/src');
      expect(responseText).toContain('/public');
      expect(responseText).toContain('/docs');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should not include branch field in output', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [{ path: '/README.md', size: 1024 }],
        folders: {
          folders: [{ path: '/src' }],
        },
        summary: {
          totalFiles: 1,
          totalFolders: 1,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              id: 'no-branch-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // Branch is now in the query field (original query is included in new structure)
      expect(responseText).toContain('query:');
      expect(responseText).toContain('branch: "main"');
      // But branch should NOT be in the data field
      const dataMatch = responseText.match(/data:\s*\n([\s\S]*?)(?=\n\w+:|$)/);
      if (dataMatch && dataMatch[1]) {
        expect(dataMatch[1]).not.toContain('branch:');
      }
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('owner: "test"');
      expect(responseText).toContain('path: "/"');
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('files:');
      expect(responseText).toContain('folders:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should use correct field ordering: queryId, reasoning, repository, path, files, folders', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [{ path: '/test.js', size: 500 }],
        folders: {
          folders: [{ path: '/utils' }],
        },
        summary: {
          totalFiles: 1,
          totalFolders: 1,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              reasoning: 'Test field ordering',
              id: 'field-order-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // Verify field ordering by checking the response contains the fields in the correct order
      const reasoningIndex = responseText.indexOf('reasoning:');
      const ownerIndex = responseText.indexOf('owner:');
      const repoIndex = responseText.indexOf('repo:');
      const pathIndex = responseText.indexOf('path:');
      const filesIndex = responseText.indexOf('files:');
      const foldersIndex = responseText.indexOf('folders:');

      // Verify all fields exist (must be found, not -1)
      expect(reasoningIndex).not.toEqual(-1);
      expect(ownerIndex).not.toEqual(-1);
      expect(repoIndex).not.toEqual(-1);
      expect(pathIndex).not.toEqual(-1);
      expect(filesIndex).not.toEqual(-1);
      expect(foldersIndex).not.toEqual(-1);

      // Verify strict field ordering: reasoning < owner < repo < path < files < folders
      expect(reasoningIndex < ownerIndex).toEqual(true);
      expect(ownerIndex < repoIndex).toEqual(true);
      expect(repoIndex < pathIndex).toEqual(true);
      expect(pathIndex < filesIndex).toEqual(true);
      expect(filesIndex < foldersIndex).toEqual(true);

      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle empty path prefix removal correctly', async () => {
      // Mock API response with files that don't have a common prefix
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [
          { path: '/utils/helper.js', size: 300 },
          { path: '/utils/config.js', size: 200 },
        ],
        folders: {
          folders: [{ path: '/utils/lib' }],
        },
        summary: {
          totalFiles: 2,
          totalFolders: 1,
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '/utils',
              id: 'utils-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // Verify the /utils prefix is removed
      expect(responseText).toContain('/helper.js');
      expect(responseText).toContain('/config.js');
      expect(responseText).toContain('/lib');

      // Verify the original paths with prefix are not present
      expect(responseText).not.toContain('/utils/helper.js');
      expect(responseText).not.toContain('/utils/config.js');
      expect(responseText).not.toContain('/utils/lib');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle multiple queries with different path prefixes', async () => {
      // Mock API responses for different calls
      mockViewGitHubRepositoryStructureAPI
        .mockResolvedValueOnce({
          files: [
            { path: '/src/App.js', size: 1000 },
            { path: '/src/index.js', size: 500 },
          ],
          folders: {
            folders: [{ path: '/src/components' }],
          },
          summary: { totalFiles: 2, totalFolders: 1 },
        })
        .mockResolvedValueOnce({
          files: [
            { path: '/docs/README.md', size: 800 },
            { path: '/docs/API.md', size: 600 },
          ],
          folders: {
            folders: [{ path: '/docs/images' }],
          },
          summary: { totalFiles: 2, totalFolders: 1 },
        });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '/src',
              id: 'src-test',
            },
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
              path: '/docs',
              id: 'docs-test',
            },
          ],
        }
      );

      const responseText = getTextContent(result.content);

      expect(result.isError).toBe(false);
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');

      // Verify both queries have their prefixes removed correctly
      // First query (/src)
      expect(responseText).toContain('/App.js');
      expect(responseText).toContain('/index.js');
      expect(responseText).toContain('/components');

      // Second query (/docs)
      expect(responseText).toContain('/README.md');
      expect(responseText).toContain('/API.md');
      expect(responseText).toContain('/images');

      // Verify original prefixed paths are not present
      expect(responseText).not.toContain('/src/App.js');
      expect(responseText).not.toContain('/docs/README.md');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid API response structure', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        // Missing 'files' array
        folders: {
          folders: [{ path: '/src' }],
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
    });

    it('should handle API errors', async () => {
      mockViewGitHubRepositoryStructureAPI.mockRejectedValue(
        new Error('API Error')
      );

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi
        .fn()
        .mockRejectedValue(new Error('Callback error'));

      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [{ path: '/README.md', size: 1024 }],
        folders: {
          folders: [],
        },
      });

      // Re-register with error callback
      const newMockServer = createMockMcpServer();
      registerViewGitHubRepoStructureTool(newMockServer.server, errorCallback);

      const result = await newMockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
            },
          ],
        }
      );

      // Should continue despite callback error
      expect(result.isError).toBe(false);
      expect(errorCallback).toHaveBeenCalled();

      newMockServer.cleanup();
    });

    it('should handle empty files response', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        files: [],
        folders: {
          folders: [],
        },
      });

      const result = await mockServer.callTool(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        {
          queries: [
            {
              owner: 'test',
              repo: 'repo',
              branch: 'main',
            },
          ],
        }
      );

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "empty"');
    });
  });
});
