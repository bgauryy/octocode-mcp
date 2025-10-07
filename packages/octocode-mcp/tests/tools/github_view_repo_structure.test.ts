import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/index.js', () => ({
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
}));

import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';

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
    const result = await mockServer.callTool('githubViewRepoStructure', {
      queries: [
        {
          owner: 'test',
          repo: 'repo',
          branch: 'main',
        },
      ],
    });

    expect(result).toEqual({
      isError: false,
      content: [
        {
          type: 'text',
          text: `hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Explore src/ or packages/ first for relevant files"
      - "Use depth: 2 to surface key files/folders quickly"
      - "Build targeted code searches from discovered path and filename patterns"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Focus on source code and example directories for implementation details"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        path: "/"
        files:
          - "/README.md"
          - "/package.json"
        folders:
          - "/src"
          - "/tests"
`,
        },
      ],
    });
  });

  it('should pass authInfo and userContext to GitHub API', async () => {
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

    await mockServer.callTool('githubViewRepoStructure', {
      queries: [
        {
          owner: 'test-owner',
          repo: 'test-repo',
          branch: 'main',
          id: 'structure-auth-test',
        },
      ],
    });

    // Verify the API was called with authInfo and userContext
    expect(mockViewGitHubRepositoryStructureAPI).toHaveBeenCalledTimes(1);
    const apiCall = mockViewGitHubRepositoryStructureAPI.mock.calls[0];

    // Should be called with (apiRequest, authInfo, userContext)
    expect(apiCall).toBeDefined();
    expect(apiCall).toHaveLength(3);
    expect(apiCall?.[1]).toEqual(undefined); // authInfo (now undefined)
    expect(apiCall?.[2]).toEqual({
      userId: 'anonymous',
      userLogin: 'anonymous',
      isEnterpriseMode: false,
      sessionId: undefined,
    }); // userContext
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

    expect(responseText).toEqual(`hints:
  - "Query results: 1 failed"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    failed:
      - "Resource not found. Verify spelling and accessibility"
      - "Verify repository owner and name are correct"
      - "Check that the branch exists (try \\"main\\" or \\"master\\")"
      - "Ensure you have access to the repository"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Focus on source code and example directories for implementation details"
  queries:
    failed:
      - owner: "nonexistent"
        repo: "repo"
        path: "/"
        error: "Repository not found or access denied"
        metadata:
          error: "Repository not found or access denied"
          originalQuery:
            owner: "nonexistent"
            repo: "repo"
            branch: "main"
          searchType: "api_error"
`);
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

    expect(result).toEqual({
      isError: false,
      content: [
        {
          type: 'text',
          text: `hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Explore src/ or packages/ first for relevant files"
      - "Use depth: 2 to surface key files/folders quickly"
      - "Build targeted code searches from discovered path and filename patterns"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Focus on source code and example directories for implementation details"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        path: "src"
        files:
          - "/README.md"
          - "/package.json"
        folders:
          - "/src"
          - "/tests"
`,
        },
      ],
    });
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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'iamshaunjp',
            repo: 'react-context-hooks',
            branch: 'main',
            path: '/contextapp',
            id: 'contextapp-test',
          },
        ],
      });

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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'facebook',
            repo: 'react',
            branch: 'main',
            path: '/',
            id: 'root-test',
          },
        ],
      });

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

      // For root path, files and folders should keep their absolute paths
      expect(responseText).toContain('/.gitignore');
      expect(responseText).toContain('/package.json');
      expect(responseText).toContain('/README.md');
      expect(responseText).toContain('/src');
      expect(responseText).toContain('/public');
      expect(responseText).toContain('/docs');
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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            id: 'no-branch-test',
          },
        ],
      });

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

      // Verify branch field is not in the output
      expect(responseText).not.toContain('branch:');
      expect(responseText).not.toContain('branch: "main"');

      // Verify other expected fields are present in new format
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('owner: "test"');
      expect(responseText).toContain('path: "/"');
      expect(responseText).toContain('1 successful');
      expect(responseText).toContain('improve your research strategy');
      expect(responseText).toContain('files:');
      expect(responseText).toContain('folders:');
      // Should NOT contain empty sections
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            reasoning: 'Test field ordering',
            id: 'field-order-test',
          },
        ],
      });

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

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            path: '/utils',
            id: 'utils-test',
          },
        ],
      });

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

      // Verify the /utils prefix is removed
      expect(responseText).toContain('/helper.js');
      expect(responseText).toContain('/config.js');
      expect(responseText).toContain('/lib');

      // Verify the original paths with prefix are not present
      expect(responseText).not.toContain('/utils/helper.js');
      expect(responseText).not.toContain('/utils/config.js');
      expect(responseText).not.toContain('/utils/lib');
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

      const result = await mockServer.callTool('githubViewRepoStructure', {
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
      });

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
    });
  });
});
