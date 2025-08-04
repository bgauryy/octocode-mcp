import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubIssuesAPI = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubIssuesAPI: mockSearchGitHubIssuesAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: vi.fn(),
  withCache: vi.fn(),
}));

// Import after mocking
import { registerSearchGitHubIssuesTool } from '../../src/mcp/tools/github_search_issues.js';

// Helper function to create standard mock response
function createMockIssueResponse(overrides: any = {}) {
  return {
    total_count: 1,
    incomplete_results: false,
    issues: [
      {
        id: 123,
        number: 123,
        title: 'Test issue',
        state: 'open',
        user: {
          login: 'testuser',
          id: 1,
          avatar_url: '',
          html_url: '',
          type: 'User',
        },
        body: 'Test issue body',
        repository: {
          id: 1,
          name: 'test-repo',
          full_name: 'test/test-repo',
          owner: { login: 'test', id: 1, type: 'User' },
          private: false,
          html_url: 'https://github.com/test/test-repo',
          description: 'Test repo',
          fork: false,
          language: 'JavaScript',
          stargazers_count: 0,
          watchers_count: 0,
          forks_count: 0,
          open_issues_count: 1,
          default_branch: 'main',
        },
        url: 'https://api.github.com/repos/test/test-repo/issues/123',
        html_url: 'https://github.com/test/test-repo/issues/123',
        repository_url: 'https://api.github.com/repos/test/test-repo',
        labels_url:
          'https://api.github.com/repos/test/test-repo/issues/123/labels{/name}',
        comments_url:
          'https://api.github.com/repos/test/test-repo/issues/123/comments',
        events_url:
          'https://api.github.com/repos/test/test-repo/issues/123/events',
        state_reason: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        closed_at: null,
        assignee: null,
        assignees: [],
        labels: [],
        milestone: null,
        locked: false,
        active_lock_reason: null,
        comments: 0,
        reactions: {
          '+1': 0,
          '-1': 0,
          laugh: 0,
          hooray: 0,
          confused: 0,
          heart: 0,
          rocket: 0,
          eyes: 0,
          total_count: 0,
          url: 'https://api.github.com/repos/test/test-repo/issues/123/reactions',
        },
        score: 1.0,
        ...overrides,
      },
    ],
  };
}

describe('GitHub Search Issues Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    registerSearchGitHubIssuesTool(mockServer.server, {
      npmEnabled: false,
      ghToken: 'test-token',
    });

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default successful API response using helper
    mockSearchGitHubIssuesAPI.mockResolvedValue(createMockIssueResponse());
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should perform basic issue search', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'bug fix',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubIssuesAPI).toHaveBeenCalledWith(
        { query: 'bug fix' },
        'test-token'
      );
    });

    it('should handle repository-specific search', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'error',
        owner: 'facebook',
        repo: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubIssuesAPI).toHaveBeenCalledWith(
        {
          query: 'error',
          owner: 'facebook',
          repo: 'react',
        },
        'test-token'
      );
    });

    it('should handle complex search with multiple filters', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'bug',
        owner: 'microsoft',
        repo: 'vscode',
        state: 'open',
        label: ['bug', 'help-wanted'],
        sort: 'created',
        order: 'desc',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubIssuesAPI).toHaveBeenCalledWith(
        {
          query: 'bug',
          owner: 'microsoft',
          repo: 'vscode',
          state: 'open',
          label: ['bug', 'help-wanted'],
          sort: 'created',
          order: 'desc',
        },
        'test-token'
      );
    });
  });

  describe('Input Validation', () => {
    it('should reject empty query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Provide keywords like "bug", "error", "feature"'
      );
    });

    it('should reject missing query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Provide keywords like "bug", "error", "feature"'
      );
    });

    it('should reject overly long query', async () => {
      const longQuery = 'a'.repeat(300);
      const result = await mockServer.callTool('githubSearchIssues', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Use shorter, more focused search terms'
      );
    });

    it('should accept valid query length', async () => {
      const validQuery = 'a'.repeat(200);
      const result = await mockServer.callTool('githubSearchIssues', {
        query: validQuery,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue({
        error: 'API rate limit exceeded',
        status: 429,
        hints: ['Wait before retrying', 'Check rate limit status'],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      mockSearchGitHubIssuesAPI.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.hints).toContain(
        'Check your internet connection and retry the request'
      );
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from issue responses', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue(
        createMockIssueResponse({
          title: 'Security issue',
          body: 'Token leaked: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        })
      );

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'token',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that the token was sanitized in the response
      expect(response.data.issues[0].body).not.toContain('ghp_');
      expect(response.data.issues[0].body).toContain('[REDACTED-GITHUBTOKENS]');
    });

    it('should sanitize API keys from issue responses', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue(
        createMockIssueResponse({
          number: 456,
          title: 'API integration',
          body: 'OpenAI key: sk-1234567890abcdefT3BlbkFJ1234567890abcdef',
        })
      );

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'api key',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that the API key was sanitized (happens in wrapResponse)
      expect(response.data.issues[0].body).not.toContain('T3BlbkFJ');
      expect(response.data.issues[0].body).toContain('[REDACTED-OPENAIAPIKEY]');
    });

    it('should preserve clean content without secrets', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue(
        createMockIssueResponse({
          number: 789,
          title: 'Clean issue',
          body: 'This is a normal issue description without any sensitive information.',
        })
      );

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'clean',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      // Check that clean content is preserved
      expect(response.data.issues[0].body).toBe(
        'This is a normal issue description without any sensitive information.'
      );
    });
  });
});
