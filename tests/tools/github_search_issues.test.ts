import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockSearchGitHubIssuesAPI = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/githubAPI.js', () => ({
  searchGitHubIssuesAPI: mockSearchGitHubIssuesAPI,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerSearchGitHubIssuesTool } from '../../src/mcp/tools/github_search_issues.js';

describe('GitHub Search Issues Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    registerSearchGitHubIssuesTool(mockServer.server);

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default successful API response
    mockSearchGitHubIssuesAPI.mockResolvedValue({
      isError: false,
      content: [
        {
          text: JSON.stringify({
            results: [
              {
                number: 123,
                title: 'Test issue',
                state: 'open',
                author: { login: 'testuser' },
                repository: {
                  name: 'test-repo',
                  nameWithOwner: 'test/test-repo',
                },
                labels: [],
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-01T00:00:00Z',
                url: 'https://github.com/test/test-repo/issues/123',
                commentsCount: 0,
                reactions: 0,
                body: 'Test issue description',
                created_at: '01/01/2023',
                updated_at: '01/01/2023',
              },
            ],
            total_count: 1,
          }),
        },
      ],
    });
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the GitHub search issues tool with correct parameters', () => {
      const newMockServer = createMockMcpServer();
      registerSearchGitHubIssuesTool(newMockServer.server);

      expect(newMockServer.server.registerTool).toHaveBeenCalledWith(
        'githubSearchIssues',
        expect.objectContaining({
          description: expect.stringContaining('Search GitHub issues'),
          inputSchema: expect.objectContaining({
            query: expect.any(Object),
            owner: expect.any(Object),
            repo: expect.any(Object),
          }),
        }),
        expect.any(Function)
      );

      newMockServer.cleanup();
    });
  });

  describe('Successful Issue Searches', () => {
    it('should perform basic issue search', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'bug fix',
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubIssuesAPI).toHaveBeenCalledWith(
        { query: 'bug fix' },
        undefined
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
        undefined
      );
    });

    it('should handle complex search with multiple filters', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'bug',
        state: 'open',
        label: ['bug', 'critical'],
        author: 'developer',
        limit: 10,
      });

      expect(result.isError).toBe(false);
      expect(mockSearchGitHubIssuesAPI).toHaveBeenCalledWith(
        {
          query: 'bug',
          state: 'open',
          label: ['bug', 'critical'],
          author: 'developer',
          limit: 10,
        },
        undefined
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue({
        isError: true,
        content: [
          {
            text: JSON.stringify({
              error: 'API rate limit exceeded',
              results: [],
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle API exceptions', async () => {
      mockSearchGitHubIssuesAPI.mockRejectedValue(new Error('Network error'));

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
    });

    it('should reject whitespace-only query', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: '   ',
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
    });

    it('should reject overly long query', async () => {
      const longQuery = 'a'.repeat(300);
      const result = await mockServer.callTool('githubSearchIssues', {
        query: longQuery,
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
    });

    it('should accept valid query length', async () => {
      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'valid query',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize GitHub tokens from issue responses', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 123,
                  title: 'Security issue',
                  body: 'Token leaked: [GITHUB_TOKEN_REDACTED]',
                  state: 'open',
                  author: { login: 'testuser' },
                  repository: {
                    name: 'test-repo',
                    nameWithOwner: 'test/test-repo',
                  },
                  labels: [],
                  createdAt: '2023-01-01T00:00:00Z',
                  updatedAt: '2023-01-01T00:00:00Z',
                  url: 'https://github.com/test/test-repo/issues/123',
                  commentsCount: 0,
                  reactions: 0,
                  created_at: '01/01/2023',
                  updated_at: '01/01/2023',
                  _sanitization_warnings: [
                    'Detected and redacted GitHub token',
                  ],
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'token',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].body).not.toContain('ghp_');
      expect(response.results[0].body).toContain('[GITHUB_TOKEN_REDACTED]');
      expect(response.results[0]._sanitization_warnings).toContain(
        'Detected and redacted GitHub token'
      );
    });

    it('should sanitize API keys from issue responses', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 456,
                  title: 'API integration',
                  body: 'OpenAI key: [OPENAI_KEY_REDACTED]',
                  state: 'open',
                  author: { login: 'testuser' },
                  repository: {
                    name: 'test-repo',
                    nameWithOwner: 'test/test-repo',
                  },
                  labels: [],
                  createdAt: '2023-01-01T00:00:00Z',
                  updatedAt: '2023-01-01T00:00:00Z',
                  url: 'https://github.com/test/test-repo/issues/456',
                  commentsCount: 0,
                  reactions: 0,
                  created_at: '01/01/2023',
                  updated_at: '01/01/2023',
                  _sanitization_warnings: [
                    'Detected and redacted OpenAI API key',
                  ],
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'openai',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].body).not.toContain('sk-');
      expect(response.results[0].body).toContain('[OPENAI_KEY_REDACTED]');
      expect(response.results[0]._sanitization_warnings).toContain(
        'Detected and redacted OpenAI API key'
      );
    });

    it('should preserve clean content without secrets', async () => {
      mockSearchGitHubIssuesAPI.mockResolvedValue({
        isError: false,
        content: [
          {
            text: JSON.stringify({
              results: [
                {
                  number: 789,
                  title: 'Clean issue',
                  body: 'This is a normal issue description without any sensitive information.',
                  state: 'open',
                  author: { login: 'testuser' },
                  repository: {
                    name: 'test-repo',
                    nameWithOwner: 'test/test-repo',
                  },
                  labels: [],
                  createdAt: '2023-01-01T00:00:00Z',
                  updatedAt: '2023-01-01T00:00:00Z',
                  url: 'https://github.com/test/test-repo/issues/789',
                  commentsCount: 0,
                  reactions: 0,
                  created_at: '01/01/2023',
                  updated_at: '01/01/2023',
                },
              ],
              total_count: 1,
            }),
          },
        ],
      });

      const result = await mockServer.callTool('githubSearchIssues', {
        query: 'normal',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);

      expect(response.results[0].body).toBe(
        'This is a normal issue description without any sensitive information.'
      );
      expect(response.results[0]._sanitization_warnings).toBeUndefined();
    });
  });
});
