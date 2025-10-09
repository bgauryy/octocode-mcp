/**
 * Comprehensive Response Structure Tests
 *
 * Tests all tools to ensure they properly handle all combinations of:
 * - hasResults: queries that returned results
 * - empty: queries that ran but found no matches
 * - failed: queries that encountered errors
 *
 * Combinations tested:
 * 1. hasResults only
 * 2. empty only
 * 3. failed only
 * 4. hasResults + empty
 * 5. hasResults + failed
 * 6. empty + failed
 * 7. hasResults + empty + failed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());
const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());
const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());

// Mock all GitHub API functions
vi.mock('../../src/github/index.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: vi.fn(),
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
}));

import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';

describe('Response Structure - All Tools', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();

    // Mock server configuration
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: false,
    });
    mockIsSamplingEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('GitHub Search Code Tool', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should handle hasResults queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
        },
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Test hasResults',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test hasResults"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: { items: [] },
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['nonexistent'],
            reasoning: 'Test empty',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test empty"');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('1 empty');
    });

    it('should handle failed queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        error: 'API error',
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['error'],
            reasoning: 'Test failed',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('query:');
      expect(responseText).toContain('reasoning: "Test failed"');
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).toContain('1 failed');
    });

    it('should handle successful + empty combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
          },
        })
        .mockResolvedValueOnce({
          data: { items: [] },
        });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty');
    });

    it('should handle successful + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
          },
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 failed');
    });

    it('should handle empty + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: { items: [] },
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 empty, 1 failed');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
          },
        })
        .mockResolvedValueOnce({
          data: { items: [] },
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub Fetch Content Tool', () => {
    beforeEach(() => {
      registerFetchGitHubFileContentTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValueOnce({
        data: {
          path: 'file.js',
          content: 'console.log("test")',
          contentLength: 20,
          owner: 'test',
          repo: 'repo',
        },
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'file.js',
            reasoning: 'Test successful',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle failed queries only', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValueOnce({
        error: 'File not found',
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'missing.js',
            reasoning: 'Test failed',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 failed');
    });

    it('should handle successful + failed combination', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            path: 'file.js',
            content: 'console.log("test")',
            contentLength: 20,
            owner: 'test',
            repo: 'repo',
          },
        })
        .mockResolvedValueOnce({
          error: 'File not found',
        });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'file.js',
            reasoning: 'Will succeed',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'missing.js',
            reasoning: 'Will fail',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 failed');
    });
  });

  describe('GitHub Search Repositories Tool', () => {
    beforeEach(() => {
      registerSearchGitHubReposTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockSearchGitHubReposAPI.mockResolvedValueOnce({
        data: {
          repositories: [
            { repository: 'test/repo', description: 'Test', stars: 100 },
          ],
        },
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Test successful',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubReposAPI.mockResolvedValueOnce({
        data: { repositories: [] },
      });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          {
            keywordsToSearch: ['nonexistent'],
            reasoning: 'Test empty',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubReposAPI
        .mockResolvedValueOnce({
          data: {
            repositories: [
              { repository: 'test/repo', description: 'Test', stars: 100 },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: { repositories: [] },
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchRepositories', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub Search Pull Requests Tool', () => {
    beforeEach(() => {
      registerSearchGitHubPullRequestsTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValueOnce({
        pull_requests: [{ number: 1, title: 'PR', url: 'url' }],
        total_count: 1,
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            query: 'test',
            reasoning: 'Test successful',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValueOnce({
        pull_requests: [],
        total_count: 0,
      });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          {
            query: 'nonexistent',
            reasoning: 'Test empty',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockSearchGitHubPullRequestsAPI
        .mockResolvedValueOnce({
          pull_requests: [{ number: 1, title: 'PR', url: 'url' }],
          total_count: 1,
        })
        .mockResolvedValueOnce({
          pull_requests: [],
          total_count: 0,
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchPullRequests', {
        queries: [
          { query: 'found', reasoning: 'Will succeed' },
          { query: 'notfound', reasoning: 'Will be empty' },
          { query: 'error', reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('GitHub View Repository Structure Tool', () => {
    beforeEach(() => {
      registerViewGitHubRepoStructureTool(mockServer.server);
    });

    it('should handle successful queries only', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValueOnce({
        files: [{ path: 'README.md', size: 100 }],
        folders: { folders: [{ path: 'src', size: 1000 }] },
      });

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            reasoning: 'Test successful',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 hasResults');
    });

    it('should handle empty queries only', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValueOnce({
        files: [],
        folders: { folders: [] },
      });

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            reasoning: 'Test empty',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).not.toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
      expect(responseText).toContain('1 empty');
    });

    it('should handle successful + empty + failed combination', async () => {
      mockViewGitHubRepositoryStructureAPI
        .mockResolvedValueOnce({
          files: [{ path: 'README.md', size: 100 }],
          folders: { folders: [{ path: 'src', size: 1000 }] },
        })
        .mockResolvedValueOnce({
          files: [],
          folders: { folders: [] },
        })
        .mockResolvedValueOnce({
          error: 'Repository not found',
        });

      const result = await mockServer.callTool('githubViewRepoStructure', {
        queries: [
          {
            owner: 'test',
            repo: 'repo1',
            branch: 'main',
            reasoning: 'Will succeed',
          },
          {
            owner: 'test',
            repo: 'empty',
            branch: 'main',
            reasoning: 'Will be empty',
          },
          {
            owner: 'test',
            repo: 'missing',
            branch: 'main',
            reasoning: 'Will fail',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('1 hasResults, 1 empty, 1 failed');
    });
  });

  describe('Hints Organization', () => {
    beforeEach(() => {
      registerGitHubSearchCodeTool(mockServer.server);
    });

    it('should include hints for each result type', async () => {
      mockSearchGitHubCodeAPI
        .mockResolvedValueOnce({
          data: {
            items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
          },
        })
        .mockResolvedValueOnce({
          data: { items: [] },
        })
        .mockResolvedValueOnce({
          error: 'API error',
        });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          { keywordsToSearch: ['found'], reasoning: 'Will succeed' },
          { keywordsToSearch: ['notfound'], reasoning: 'Will be empty' },
          { keywordsToSearch: ['error'], reasoning: 'Will fail' },
        ],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('instructions:');
      expect(responseText).toContain('results:');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('errorStatusHints:');

      expect(responseText).toMatch(/hasResultsStatusHints:[\s\S]*-/);
    });

    it('should only include hint sections for result types that exist', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
        },
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [{ keywordsToSearch: ['found'], reasoning: 'Will succeed' }],
      });

      const responseText = result.content[0]?.text as string;

      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).not.toContain('status: "empty"');
      expect(responseText).not.toContain('status: "error"');
    });
  });
});
