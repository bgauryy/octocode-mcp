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
      structure: {
        '.': {
          files: ['README.md', 'package.json'],
          folders: ['src', 'tests'],
        },
      },
      path: '/',
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
      structure: {
        '.': {
          files: ['README.md'],
          folders: ['src'],
        },
      },
      path: '/',
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
    // Query fields (owner, repo, branch) are no longer echoed in response
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
    expect(responseText).toContain('path: "src"');
    expect(responseText).not.toMatch(/^data:/m);
    expect(responseText).not.toContain('queries:');
    expect(responseText).not.toMatch(/^hints:/m);
  });

  describe('New Features Tests', () => {
    it('should remove path prefix from files and folders for subdirectory paths', async () => {
      // Mock API response with files and folders that have the path prefix
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['.gitignore', 'package.json'],
            folders: ['src', 'public'],
          },
          src: {
            files: ['App.js', 'index.js'],
            folders: ['components'],
          },
        },
        path: '/contextapp',
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
      expect(responseText).toContain('status: "hasResults"');

      // Verify files are present
      expect(responseText).toContain('.gitignore');
      expect(responseText).toContain('package.json');
      expect(responseText).toContain('App.js');
      expect(responseText).toContain('index.js');

      // Verify folders are present
      expect(responseText).toContain('src');
      expect(responseText).toContain('public');
      expect(responseText).toContain('components');

      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle root path without removing prefixes', async () => {
      // Mock API response for root directory
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['.gitignore', 'package.json', 'README.md'],
            folders: ['src', 'public', 'docs'],
          },
        },
        path: '/',
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
      expect(responseText).toContain('status: "hasResults"');

      // For root path, files and folders should be present
      expect(responseText).toContain('.gitignore');
      expect(responseText).toContain('package.json');
      expect(responseText).toContain('README.md');
      expect(responseText).toContain('src');
      expect(responseText).toContain('public');
      expect(responseText).toContain('docs');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should include branch field in output', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['README.md'],
            folders: ['src'],
          },
        },
        path: '/',
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

      // Branch should be in the response data
      expect(responseText).toContain('branch: "main"');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "/"');
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('files:');
      expect(responseText).toContain('folders:');
      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should use correct field ordering: path, files, folders', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['test.js'],
            folders: ['utils'],
          },
        },
        path: '/',
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
      expect(responseText).toContain('status: "hasResults"');

      // Verify key fields exist in the response
      const statusIndex = responseText.indexOf('status:');
      const pathIndex = responseText.indexOf('path:');
      const structureIndex = responseText.indexOf('structure:');

      // Verify all fields exist (must be found, not -1)
      expect(statusIndex).not.toEqual(-1);
      expect(pathIndex).not.toEqual(-1);
      expect(structureIndex).not.toEqual(-1);

      // Verify field ordering: path < structure (in data section)
      expect(pathIndex < structureIndex).toEqual(true);

      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle empty path prefix removal correctly', async () => {
      // Mock API response for utils directory
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['helper.js', 'config.js'],
            folders: ['lib'],
          },
        },
        path: '/utils',
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
      expect(responseText).toContain('status: "hasResults"');

      // Verify files and folders are present
      expect(responseText).toContain('helper.js');
      expect(responseText).toContain('config.js');
      expect(responseText).toContain('lib');

      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });

    it('should handle multiple queries with different path prefixes', async () => {
      // Mock API responses for different calls
      mockViewGitHubRepositoryStructureAPI
        .mockResolvedValueOnce({
          structure: {
            '.': {
              files: ['App.js', 'index.js'],
              folders: ['components'],
            },
          },
          path: '/src',
          summary: { totalFiles: 2, totalFolders: 1 },
        })
        .mockResolvedValueOnce({
          structure: {
            '.': {
              files: ['README.md', 'API.md'],
              folders: ['images'],
            },
          },
          path: '/docs',
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

      // Verify both queries have files and folders present
      // First query (/src)
      expect(responseText).toContain('App.js');
      expect(responseText).toContain('index.js');
      expect(responseText).toContain('components');

      // Second query (/docs)
      expect(responseText).toContain('README.md');
      expect(responseText).toContain('API.md');
      expect(responseText).toContain('images');

      expect(responseText).not.toMatch(/^data:/m);
      expect(responseText).not.toContain('queries:');
      expect(responseText).not.toMatch(/^hints:/m);
    });
  });

  describe('Error Handling', () => {
    it('should include pagination info when present in API response', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        structure: {
          '.': {
            files: ['file1.js', 'file2.js'],
            folders: ['src'],
          },
        },
        path: '/',
        summary: {
          totalFiles: 50,
          totalFolders: 10,
        },
        pagination: {
          page: 1,
          totalPages: 5,
          hasMore: true,
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
      expect(responseText).toContain('pagination:');
      expect(responseText).toContain('hasMore: true');
    });

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
        structure: {
          '.': {
            files: ['README.md'],
            folders: [],
          },
        },
        path: '/',
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
        structure: {},
        path: '/',
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
