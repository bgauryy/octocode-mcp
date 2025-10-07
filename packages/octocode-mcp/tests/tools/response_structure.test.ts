/**
 * Comprehensive Response Structure Tests
 *
 * Tests all tools to ensure they properly handle all combinations of:
 * - successful: queries that returned results
 * - empty: queries that ran but found no matches
 * - failed: queries that encountered errors
 *
 * Combinations tested:
 * 1. successful only
 * 2. empty only
 * 3. failed only
 * 4. successful + empty
 * 5. successful + failed
 * 6. empty + failed
 * 7. successful + empty + failed
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

    it('should handle successful queries only', async () => {
      mockSearchGitHubCodeAPI.mockResolvedValueOnce({
        data: {
          items: [{ path: 'file1.js', matches: [{ context: 'test' }] }],
        },
      });

      const result = await mockServer.callTool('githubSearchCode', {
        queries: [
          {
            keywordsToSearch: ['test'],
            reasoning: 'Test successful',
          },
        ],
      });

      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Use function/class names or error strings as keywords to find definitions and usages"
      - "Derive matchString for file fetches from code search text_matches"
      - "Scope away from noise directories by setting path to src/, packages/*/src"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    successful:
      - reasoning: "Test successful"
        files:
          - path: "file1.js"
            text_matches:
              - "test"
`);
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
      expect(responseText).toEqual(`hints:
  - "Query results: 1 empty"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    empty:
      - "Try broader search terms or related concepts"
      - "Use functional descriptions that focus on what the code accomplishes"
      - "Use extension, filename, path filters to target specific directories and file names"
      - "Look in tests: tests/, __tests__/, *.test.*, *.spec.* to discover real usage"
      - "After discovery, add owner/repo to narrow scope; set limit to cap results"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    empty:
      - reasoning: "Test empty"
        metadata:
          originalQuery:
            reasoning: "Test empty"
            keywordsToSearch:
              - "nonexistent"
`);
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
      expect(responseText).toEqual(`hints:
  - "Query results: 1 failed"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    failed:
      - "Verify search parameters are valid and not overly restrictive"
      - "Try removing filters (extension, path) to broaden search scope"
      - "Check repository exists and is accessible if using owner/repo filters"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Use github_fetch_content with matchString from search results for precise context extraction"
  queries:
    failed:
      - reasoning: "Test failed"
        error: "API error"
        metadata:
          originalQuery:
            reasoning: "Test failed"
            keywordsToSearch:
              - "error"
`);
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
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('1 successful, 1 empty');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 failed');
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
      expect(responseText).not.toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');
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
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 empty, 1 failed');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('1 successful');
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
      expect(responseText).not.toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).toContain('failed:');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 failed');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('1 successful');
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
      expect(responseText).not.toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).not.toContain('failed:');
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
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 empty, 1 failed');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('1 successful');
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
      expect(responseText).not.toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).not.toContain('failed:');
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
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 empty, 1 failed');
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
      expect(responseText).toContain('successful:');
      expect(responseText).not.toContain('empty:');
      expect(responseText).not.toContain('failed:');
      expect(responseText).toContain('1 successful');
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
      expect(responseText).not.toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).not.toContain('failed:');
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
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');
      expect(responseText).toContain('1 successful, 1 empty, 1 failed');
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

      // Check hints structure
      expect(responseText).toContain('hints:');
      expect(responseText).toContain('successful:');
      expect(responseText).toContain('empty:');
      expect(responseText).toContain('failed:');

      // Check that hints are specific to each type
      expect(responseText).toMatch(/hints:[\s\S]*successful:[\s\S]*-/); // has hints for successful
      expect(responseText).toMatch(/hints:[\s\S]*empty:[\s\S]*-/); // has hints for empty
      expect(responseText).toMatch(/hints:[\s\S]*failed:[\s\S]*-/); // has hints for failed
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

      // Check hints structure - should only have successful hints
      const hintsSection = responseText.match(/hints:[\s\S]*$/)?.[0] || '';
      expect(hintsSection).toContain('successful:');
      expect(hintsSection).not.toContain('empty:');
      expect(hintsSection).not.toContain('failed:');
    });
  });
});
