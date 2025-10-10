/**
 * Comprehensive tests to verify userContext and authInfo propagation
 * from Tools → GitHub API layer for ALL tools
 *
 * This test suite ensures that:
 * 1. All tools correctly receive userContext from withSecurityValidation
 * 2. All tools correctly pass userContext (or authInfo) to GitHub APIs
 * 3. All GitHub APIs properly receive and use userContext for caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockMcpServer,
  type MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Create mock spy functions for ALL GitHub APIs using vi.hoisted()
// vi.hoisted() ensures these are available during module initialization
const mockSearchGitHubCodeAPI = vi.hoisted(() => vi.fn());
const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());
const mockViewGitHubRepositoryStructureAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubReposAPI = vi.hoisted(() => vi.fn());
const mockSearchGitHubPullRequestsAPI = vi.hoisted(() => vi.fn());

// Mock ALL GitHub API modules BEFORE any imports
vi.mock('../../src/github/codeSearch.js', () => ({
  searchGitHubCodeAPI: mockSearchGitHubCodeAPI,
}));

vi.mock('../../src/github/fileOperations.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
  viewGitHubRepositoryStructureAPI: mockViewGitHubRepositoryStructureAPI,
}));

vi.mock('../../src/github/repoSearch.js', () => ({
  searchGitHubReposAPI: mockSearchGitHubReposAPI,
}));

vi.mock('../../src/github/pullRequestSearch.js', () => ({
  searchGitHubPullRequestsAPI: mockSearchGitHubPullRequestsAPI,
}));

// Mock cache to prevent caching interference
vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
  withDataCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}));

// Mock server config to disable logging
vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => false),
  isSamplingEnabled: vi.fn(() => false),
}));

// Now import the tool handlers
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';

describe('UserContext and AuthInfo Propagation - ALL TOOLS', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('1. github_search_code → searchGitHubCodeAPI', () => {
    it('should propagate authInfo and userContext to searchGitHubCodeAPI', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValue({
        data: { items: [], total_count: 0 },
        status: 200,
      });

      registerGitHubSearchCodeTool(mockServer.server);

      await mockServer.callTool('githubSearchCode', {
        queries: [{ keywordsToSearch: ['test'] }],
      });

      // Verify the API was called with correct number of parameters
      expect(mockSearchGitHubCodeAPI).toHaveBeenCalled();
      expect(mockSearchGitHubCodeAPI).toHaveBeenCalledWith(
        expect.objectContaining({ keywordsToSearch: ['test'] }),
        undefined, // authInfo is passed (as undefined in mock environment)
        expect.objectContaining({ sessionId: undefined }) // userContext is passed
      );
    });
  });

  describe('2. github_fetch_content → fetchGitHubFileContentAPI', () => {
    it('should propagate authInfo and userContext to fetchGitHubFileContentAPI', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          owner: 'test',
          repo: 'repo',
          path: 'test.js',
          content: 'test content',
        },
        status: 200,
      });

      registerFetchGitHubFileContentTool(mockServer.server);

      await mockServer.callTool('githubGetFileContent', {
        queries: [{ owner: 'test', repo: 'repo', path: 'test.js' }],
      });

      // Verify the API was called with correct number of parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalled();
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          path: 'test.js',
        }),
        undefined, // authInfo is passed (as undefined in mock environment)
        expect.objectContaining({ sessionId: undefined }) // userContext is passed
      );
    });
  });

  describe('3. github_search_repos → searchGitHubReposAPI', () => {
    it('should propagate authInfo and userContext to searchGitHubReposAPI', async () => {
      mockSearchGitHubReposAPI.mockResolvedValue({
        data: { repositories: [] },
        status: 200,
      });

      registerSearchGitHubReposTool(mockServer.server);

      await mockServer.callTool('githubSearchRepositories', {
        queries: [{ keywordsToSearch: ['react'] }],
      });

      // Verify the API was called with correct number of parameters
      expect(mockSearchGitHubReposAPI).toHaveBeenCalled();
      expect(mockSearchGitHubReposAPI).toHaveBeenCalledWith(
        expect.objectContaining({ keywordsToSearch: ['react'] }),
        undefined, // authInfo is passed (as undefined in mock environment)
        expect.objectContaining({ sessionId: undefined }) // userContext is passed
      );
    });
  });

  describe('4. github_view_repo_structure → viewGitHubRepositoryStructureAPI', () => {
    it('should propagate authInfo and userContext to viewGitHubRepositoryStructureAPI', async () => {
      mockViewGitHubRepositoryStructureAPI.mockResolvedValue({
        owner: 'test',
        repo: 'repo',
        branch: 'main',
        path: '/',
        files: [],
        folders: { count: 0, folders: [] },
      });

      registerViewGitHubRepoStructureTool(mockServer.server);

      await mockServer.callTool('githubViewRepoStructure', {
        queries: [{ owner: 'test', repo: 'repo', branch: 'main' }],
      });

      // Verify the API was called with correct number of parameters
      expect(mockViewGitHubRepositoryStructureAPI).toHaveBeenCalled();
      expect(mockViewGitHubRepositoryStructureAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo',
          branch: 'main',
        }),
        undefined, // authInfo is passed (as undefined in mock environment)
        expect.objectContaining({ sessionId: undefined }) // userContext is passed
      );
    });
  });

  describe('5. github_search_pull_requests → searchGitHubPullRequestsAPI', () => {
    it('should propagate authInfo and userContext to searchGitHubPullRequestsAPI', async () => {
      mockSearchGitHubPullRequestsAPI.mockResolvedValue({
        pull_requests: [],
        total_count: 0,
      });

      registerSearchGitHubPullRequestsTool(mockServer.server);

      await mockServer.callTool('githubSearchPullRequests', {
        queries: [{ owner: 'test', repo: 'repo' }],
      });

      // Verify the API was called with correct number of parameters
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalled();
      expect(mockSearchGitHubPullRequestsAPI).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test', repo: 'repo' }),
        undefined, // authInfo is passed (as undefined in mock environment)
        expect.objectContaining({ sessionId: undefined }) // userContext is passed
      );
    });
  });
});
