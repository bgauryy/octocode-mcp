import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { RequestError } from 'octokit';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockOctokit = vi.hoisted(() => ({
  rest: {
    search: {
      code: vi.fn(),
      repos: vi.fn(),
      issuesAndPullRequests: vi.fn(),
      commits: vi.fn(),
    },
    repos: {
      getContent: vi.fn(),
      get: vi.fn(),
      getCommit: vi.fn(),
    },
    pulls: {
      get: vi.fn(),
      listCommits: vi.fn(),
    },
    issues: {
      listComments: vi.fn(),
    },
    users: {
      getAuthenticated: vi.fn(),
    },
  },
}));

const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockContentSanitizer = vi.hoisted(() => ({
  sanitizeContent: vi.fn(),
}));
const mockMinifyContentV2 = vi.hoisted(() => vi.fn());
const mockCreateResult = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('octokit', () => {
  class MockRequestError extends Error {
    status: number;
    response?: any;
    
    constructor(message: string, status: number, options: { request: any; response?: any }) {
      super(message);
      this.name = 'RequestError';
      this.status = status;
      this.response = options.response;
    }
  }
  
  return {
    Octokit: vi.fn(() => mockOctokit),
    RequestError: MockRequestError,
  };
});

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: mockContentSanitizer,
}));

vi.mock('../../src/utils/minifier.js', () => ({
  minifyContentV2: mockMinifyContentV2,
}));

vi.mock('../../src/mcp/responses.js', () => ({
  createResult: mockCreateResult,
  optimizeTextMatch: vi.fn((text: string, limit: number) => text.substring(0, limit)),
}));

// Mock process.env
const originalEnv = process.env;

// Import the functions after mocking
import {
  searchGitHubCodeAPI,
  searchGitHubReposAPI,
  fetchGitHubFileContentAPI,
  searchGitHubPullRequestsAPI,
  searchGitHubIssuesAPI,
  searchGitHubCommitsAPI,
  viewGitHubRepositoryStructureAPI,
  checkGitHubAuthAPI,
} from '../../src/utils/githubAPI.js';

describe('GitHub API Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    
    // Setup default mocks
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
    mockWithCache.mockImplementation((key, fn) => fn());
    mockCreateResult.mockImplementation((data) => data);
    mockContentSanitizer.sanitizeContent.mockReturnValue({
      content: 'sanitized content',
      warnings: [],
      hasSecrets: false,
      hasPromptInjection: false,
      isMalicious: false,
      secretsDetected: [],
    });
    mockMinifyContentV2.mockResolvedValue({
      content: 'minified content',
      failed: false,
      type: 'javascript',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('searchGitHubCodeAPI', () => {
    const mockCodeSearchParams = {
      queryTerms: ['test', 'function'],
      owner: 'facebook',
      repo: 'react',
      limit: 10,
    };

    const mockCodeSearchResponse = {
      data: {
        total_count: 1,
        items: [
          {
            path: 'src/test.js',
            repository: {
              id: 123,
              full_name: 'facebook/react',
              html_url: 'https://github.com/facebook/react',
              fork: false,
              private: false,
            },
            sha: 'abc123',
            html_url: 'https://github.com/facebook/react/blob/main/src/test.js',
            text_matches: [
              {
                fragment: 'function test() { return true; }',
                matches: [
                  {
                    text: 'test',
                    indices: [9, 13],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    it('should search GitHub code successfully', async () => {
      mockOctokit.rest.search.code.mockResolvedValue(mockCodeSearchResponse);

      const result = await searchGitHubCodeAPI(mockCodeSearchParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'test function repo:facebook/react',
        per_page: 10,
        page: 1,
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle empty query terms', async () => {
      const result = await searchGitHubCodeAPI({ queryTerms: [] });

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: ['Search query cannot be empty. Provide queryTerms.'],
      });
    });

    it('should build complex search queries correctly', async () => {
      mockOctokit.rest.search.code.mockResolvedValue(mockCodeSearchResponse);

      await searchGitHubCodeAPI({
        queryTerms: ['async', 'await'],
        language: 'javascript',
        filename: 'utils',
        extension: 'js',
        size: '>1000',
        match: ['file'],
      });

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'async await language:javascript filename:utils extension:js size:>1000 in:file',
        per_page: 30,
        page: 1,
      });
    });

    it('should handle API rate limit errors', async () => {
      const { RequestError } = await import('octokit');
      const rateLimitError = new RequestError('Rate limit exceeded', 403, {
        request: {} as any,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1234567890',
          },
        } as any,
      });

      mockOctokit.rest.search.code.mockRejectedValue(rateLimitError);

      const result = await searchGitHubCodeAPI(mockCodeSearchParams);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: expect.arrayContaining([
          expect.stringContaining('rate limit exceeded'),
          expect.stringContaining('GITHUB_TOKEN'),
        ]),
      });
    });

    it('should handle authentication errors', async () => {
      const { RequestError } = await import('octokit');
      const authError = new RequestError('Unauthorized', 401, {
        request: {} as any,
        response: {} as any,
      });

      mockOctokit.rest.search.code.mockRejectedValue(authError);

      const result = await searchGitHubCodeAPI(mockCodeSearchParams);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: expect.arrayContaining([
          expect.stringContaining('authentication required'),
          expect.stringContaining('GITHUB_TOKEN'),
        ]),
      });
    });
  });

  describe('searchGitHubReposAPI', () => {
    const mockRepoSearchParams = {
      queryTerms: ['react', 'framework'],
      language: 'javascript',
      stars: '>1000',
      limit: 5,
    };

    const mockRepoSearchResponse = {
      data: {
        total_count: 1,
        items: [
          {
            full_name: 'facebook/react',
            stargazers_count: 50000,
            description: 'A declarative, efficient, and flexible JavaScript library',
            language: 'JavaScript',
            html_url: 'https://github.com/facebook/react',
            forks_count: 15000,
            updated_at: '2023-12-01T10:00:00Z',
            owner: {
              login: 'facebook',
            },
          },
        ],
      },
    };

    it('should search GitHub repositories successfully', async () => {
      mockOctokit.rest.search.repos.mockResolvedValue(mockRepoSearchResponse);

      const result = await searchGitHubReposAPI(mockRepoSearchParams);

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith({
        q: 'react framework language:javascript stars:>1000',
        per_page: 5,
        page: 1,
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle sort and order parameters', async () => {
      mockOctokit.rest.search.repos.mockResolvedValue(mockRepoSearchResponse);

      await searchGitHubReposAPI({
        ...mockRepoSearchParams,
        sort: 'stars',
        order: 'desc',
      });

      expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith({
        q: 'react framework language:javascript stars:>1000',
        per_page: 5,
        page: 1,
        sort: 'stars',
        order: 'desc',
      });
    });

    it('should handle empty query', async () => {
      const result = await searchGitHubReposAPI({});

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          'Search query cannot be empty. Provide queryTerms, exactQuery, or filters.',
        ],
      });
    });
  });

  describe('fetchGitHubFileContentAPI', () => {
    const mockFileParams = {
      owner: 'facebook',
      repo: 'react',
      filePath: 'src/index.js',
      branch: 'main',
    };

    const mockFileResponse = {
      data: {
        type: 'file',
        content: Buffer.from('console.log("Hello World");').toString('base64'),
        size: 100,
        sha: 'abc123',
      },
    };

    it('should fetch file content successfully', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileResponse);

      const result = await fetchGitHubFileContentAPI(mockFileParams);

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'facebook',
        repo: 'react',
        path: 'src/index.js',
        ref: 'main',
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle directory responses', async () => {
      const directoryResponse = {
        data: [
          { name: 'file1.js', type: 'file' },
          { name: 'folder1', type: 'dir' },
        ],
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(directoryResponse);

      const result = await fetchGitHubFileContentAPI(mockFileParams);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          'Path is a directory. Use githubViewRepoStructure to list directory contents',
        ],
      });
    });

    it('should handle large files', async () => {
      const largeFileResponse = {
        data: {
          type: 'file',
          content: Buffer.from('content').toString('base64'),
          size: 400 * 1024, // 400KB
          sha: 'abc123',
        },
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(largeFileResponse);

      const result = await fetchGitHubFileContentAPI(mockFileParams);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          expect.stringContaining('File too large'),
        ],
      });
    });

    it('should handle binary files', async () => {
      const binaryContent = Buffer.alloc(100);
      binaryContent[0] = 0; // Add null byte to simulate binary
      
      const binaryFileResponse = {
        data: {
          type: 'file',
          content: binaryContent.toString('base64'),
          size: 100,
          sha: 'abc123',
        },
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(binaryFileResponse);

      const result = await fetchGitHubFileContentAPI(mockFileParams);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          'Binary file detected. Cannot display as text - download directly from GitHub',
        ],
      });
    });

    it('should handle partial file access with line ranges', async () => {
      const fileContent = 'line1\nline2\nline3\nline4\nline5';
      const fileResponse = {
        data: {
          type: 'file',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          sha: 'abc123',
        },
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(fileResponse);

      await fetchGitHubFileContentAPI({
        ...mockFileParams,
        startLine: 2,
        endLine: 4,
        contextLines: 1,
      });

      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle matchString parameter', async () => {
      const fileContent = 'function test() {\n  return true;\n}';
      const fileResponse = {
        data: {
          type: 'file',
          content: Buffer.from(fileContent).toString('base64'),
          size: fileContent.length,
          sha: 'abc123',
        },
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(fileResponse);

      await fetchGitHubFileContentAPI({
        ...mockFileParams,
        matchString: 'function',
      });

      expect(mockCreateResult).toHaveBeenCalled();
    });
  });

  describe('searchGitHubPullRequestsAPI', () => {
    const mockPRParams = {
      query: 'bug fix',
      owner: 'facebook',
      repo: 'react',
      state: 'open' as const,
      limit: 10,
    };

    const mockPRResponse = {
      data: {
        total_count: 1,
        items: [
          {
            number: 123,
            title: 'Fix bug in component',
            body: 'This fixes the issue with...',
            state: 'open',
            user: { login: 'developer' },
            repository_url: 'https://api.github.com/repos/facebook/react',
            labels: [{ name: 'bug' }],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/facebook/react/pull/123',
            reactions: { total_count: 5 },
            draft: false,
            pull_request: {},
          },
        ],
      },
    };

    it('should search pull requests successfully', async () => {
      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(mockPRResponse);
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          head: { ref: 'feature-branch', sha: 'head-sha' },
          base: { ref: 'main', sha: 'base-sha' },
          draft: false,
        },
      });

      const result = await searchGitHubPullRequestsAPI(mockPRParams);

      expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'bug fix is:pr repo:facebook/react is:open',
        sort: undefined,
        order: 'desc',
        per_page: 10,
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle PR with commit data', async () => {
      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(mockPRResponse);
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          head: { ref: 'feature', sha: 'head-sha' },
          base: { ref: 'main', sha: 'base-sha' },
        },
      });
      mockOctokit.rest.pulls.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'commit-sha',
            commit: {
              message: 'Fix bug',
              author: { name: 'Developer', date: '2023-01-01T00:00:00Z' },
            },
            author: { login: 'dev' },
            html_url: 'https://github.com/facebook/react/commit/commit-sha',
          },
        ],
      });
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'src/component.js',
              status: 'modified',
              additions: 5,
              deletions: 2,
              changes: 7,
              patch: '@@ -1,3 +1,6 @@\n console.log("test");',
            },
          ],
          stats: { additions: 5, deletions: 2, total: 7 },
        },
      });

      await searchGitHubPullRequestsAPI({
        ...mockPRParams,
        getCommitData: true,
      });

      expect(mockOctokit.rest.pulls.listCommits).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalled();
    });

    it('should handle PR with comments', async () => {
      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(mockPRResponse);
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          head: { ref: 'feature', sha: 'head-sha' },
          base: { ref: 'main', sha: 'base-sha' },
        },
      });
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 1,
            user: { login: 'reviewer' },
            body: 'Looks good!',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
      });

      await searchGitHubPullRequestsAPI({
        ...mockPRParams,
        withComments: true,
      });

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalled();
    });
  });

  describe('searchGitHubIssuesAPI', () => {
    const mockIssueParams = {
      query: 'memory leak',
      owner: 'facebook',
      repo: 'react',
      state: 'open' as const,
      limit: 5,
    };

    const mockIssueResponse = {
      data: {
        total_count: 1,
        items: [
          {
            number: 456,
            title: 'Memory leak in useEffect',
            body: 'There seems to be a memory leak...',
            state: 'open',
            user: {
              login: 'reporter',
              id: 123,
              html_url: 'https://github.com/reporter',
              type: 'User',
            },
            repository_url: 'https://api.github.com/repos/facebook/react',
            labels: [
              {
                name: 'bug',
                color: 'ff0000',
                description: 'Something is broken',
                id: 789,
              },
            ],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            html_url: 'https://github.com/facebook/react/issues/456',
            comments: 3,
            reactions: { total_count: 2 },
            locked: false,
            assignees: [],
            author_association: 'CONTRIBUTOR',
            id: 987654,
          },
        ],
      },
    };

    it('should search issues successfully', async () => {
      mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(mockIssueResponse);

      const result = await searchGitHubIssuesAPI(mockIssueParams);

      expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'memory leak is:issue repo:facebook/react is:open',
        sort: undefined,
        order: 'desc',
        per_page: 5,
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should include pull requests when specified', async () => {
      await searchGitHubIssuesAPI({
        ...mockIssueParams,
        'include-prs': true,
      });

      expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'memory leak repo:facebook/react is:open',
        sort: undefined,
        order: 'desc',
        per_page: 5,
      });
    });
  });

  describe('searchGitHubCommitsAPI', () => {
    const mockCommitParams = {
      queryTerms: ['fix', 'bug'],
      owner: 'facebook',
      repo: 'react',
      author: 'developer',
      limit: 10,
    };

    const mockCommitResponse = {
      data: {
        total_count: 1,
        items: [
          {
            sha: 'commit-sha-123',
            commit: {
              message: 'Fix bug in component rendering',
              author: {
                name: 'Developer',
                email: 'dev@example.com',
                date: '2023-01-01T00:00:00Z',
              },
              committer: {
                name: 'GitHub',
                email: 'noreply@github.com',
                date: '2023-01-01T00:00:00Z',
              },
            },
            author: {
              login: 'developer',
              id: 123,
              url: 'https://api.github.com/users/developer',
            },
            committer: {
              login: 'web-flow',
              id: 456,
              url: 'https://api.github.com/users/web-flow',
            },
            repository: {
              fullName: 'facebook/react',
              description: 'React library',
            },
            url: 'https://api.github.com/repos/facebook/react/commits/commit-sha-123',
          },
        ],
      },
    };

    it('should search commits successfully', async () => {
      mockOctokit.rest.search.commits.mockResolvedValue(mockCommitResponse);

      const result = await searchGitHubCommitsAPI(mockCommitParams);

      expect(mockOctokit.rest.search.commits).toHaveBeenCalledWith({
        q: 'fix bug repo:facebook/react author:developer',
        sort: 'committer-date',
        order: 'desc',
        per_page: 10,
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle commit search with changes content', async () => {
      mockOctokit.rest.search.commits.mockResolvedValue(mockCommitResponse);
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: {
          files: [
            {
              filename: 'src/component.js',
              status: 'modified',
              additions: 10,
              deletions: 5,
              changes: 15,
              patch: '@@ -1,5 +1,10 @@\n console.log("updated");',
            },
          ],
          stats: { additions: 10, deletions: 5, total: 15 },
        },
      });

      await searchGitHubCommitsAPI({
        ...mockCommitParams,
        getChangesContent: true,
      });

      expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalled();
    });
  });

  describe('viewGitHubRepositoryStructureAPI', () => {
    const mockStructureParams = {
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      path: '',
      depth: 1,
    };

    const mockStructureResponse = {
      data: [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          url: 'https://api.github.com/repos/facebook/react/contents/src',
          html_url: 'https://github.com/facebook/react/tree/main/src',
          git_url: 'https://api.github.com/repos/facebook/react/git/trees/tree-sha',
          sha: 'tree-sha',
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          size: 1500,
          url: 'https://api.github.com/repos/facebook/react/contents/package.json',
          html_url: 'https://github.com/facebook/react/blob/main/package.json',
          git_url: 'https://api.github.com/repos/facebook/react/git/blobs/blob-sha',
          download_url: 'https://raw.githubusercontent.com/facebook/react/main/package.json',
          sha: 'blob-sha',
        },
      ],
    };

    it('should view repository structure successfully', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue(mockStructureResponse);

      const result = await viewGitHubRepositoryStructureAPI(mockStructureParams);

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'facebook',
        repo: 'react',
        path: undefined,
        ref: 'main',
      });
      expect(mockCreateResult).toHaveBeenCalled();
    });

    it('should handle branch fallback when requested branch not found', async () => {
      const { RequestError } = await import('octokit');
      const notFoundError = new RequestError('Not Found', 404, {
        request: {} as any,
        response: {} as any,
      });

      mockOctokit.rest.repos.getContent
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValueOnce(mockStructureResponse);
      
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      await viewGitHubRepositoryStructureAPI({
        ...mockStructureParams,
        branch: 'nonexistent-branch',
      });

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'facebook',
        repo: 'react',
      });
    });

    it('should handle recursive directory fetching', async () => {
      const rootResponse = {
        data: [
          {
            name: 'src',
            path: 'src',
            type: 'dir',
            url: 'https://api.github.com/repos/facebook/react/contents/src',
            html_url: 'https://github.com/facebook/react/tree/main/src',
            git_url: 'https://api.github.com/repos/facebook/react/git/trees/tree-sha',
            sha: 'tree-sha',
          },
        ],
      };

      const srcResponse = {
        data: [
          {
            name: 'components',
            path: 'src/components',
            type: 'dir',
            url: 'https://api.github.com/repos/facebook/react/contents/src/components',
            html_url: 'https://github.com/facebook/react/tree/main/src/components',
            git_url: 'https://api.github.com/repos/facebook/react/git/trees/tree-sha2',
            sha: 'tree-sha2',
          },
        ],
      };

      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce(rootResponse)
        .mockResolvedValueOnce(srcResponse);

      await viewGitHubRepositoryStructureAPI({
        ...mockStructureParams,
        depth: 2,
      });

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledTimes(3);
    });
  });

  describe('checkGitHubAuthAPI', () => {
    it('should check authentication successfully', async () => {
      const mockAuthResponse = {
        data: {
          login: 'testuser',
          name: 'Test User',
          type: 'User',
        },
        headers: {
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-reset': '1234567890',
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue(mockAuthResponse);

      const result = await checkGitHubAuthAPI();

      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
      expect(mockCreateResult).toHaveBeenCalledWith({
        data: {
          authenticated: true,
          user: 'testuser',
          name: 'Test User',
          type: 'User',
          rateLimit: {
            remaining: '4999',
            limit: '5000',
            reset: '1234567890',
          },
        },
      });
    });

    it('should handle authentication failure', async () => {
      const { RequestError } = await import('octokit');
      const authError = new RequestError('Unauthorized', 401, {
        request: {} as any,
        response: {} as any,
      });

      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(authError);

      const result = await checkGitHubAuthAPI();

      expect(mockCreateResult).toHaveBeenCalledWith({
        data: {
          authenticated: false,
          message: 'No valid authentication found',
          hint: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockOctokit.rest.search.code.mockRejectedValue(networkError);

      const result = await searchGitHubCodeAPI({
        queryTerms: ['test'],
      });

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: ['Network error'],
      });
    });

    it('should handle 422 validation errors', async () => {
      const { RequestError } = await import('octokit');
      const validationError = new RequestError('Validation failed', 422, {
        request: {} as any,
        response: {} as any,
      });

      mockOctokit.rest.search.repos.mockRejectedValue(validationError);

      const result = await searchGitHubReposAPI({
        queryTerms: ['invalid-query'],
      });

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: expect.arrayContaining([
          expect.stringContaining('Search query validation failed'),
        ]),
      });
    });
  });

  describe('Environment Variables', () => {
    it('should use GITHUB_TOKEN from environment', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      // Test would require inspecting Octokit constructor calls
      // This is more of an integration test
    });

    it('should fallback to GH_TOKEN if GITHUB_TOKEN not set', () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'fallback-token';
      // Test would require inspecting Octokit constructor calls
    });
  });

  describe('Cache Integration', () => {
    it('should use cache for repeated requests', async () => {
      const cachedResult = { data: 'cached' };
      mockWithCache.mockImplementation((key, fn) => Promise.resolve(cachedResult));

      const result = await searchGitHubCodeAPI({
        queryTerms: ['test'],
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('gh-api-code', {
        queryTerms: ['test'],
      });
      expect(mockWithCache).toHaveBeenCalled();
    });
  });

  describe('Content Processing', () => {
    it('should sanitize content using ContentSanitizer', async () => {
      const mockFile = {
        data: {
          type: 'file',
          content: Buffer.from('const secret = "api-key-123";').toString('base64'),
          size: 100,
          sha: 'abc123',
        },
      };
      
      mockOctokit.rest.repos.getContent.mockResolvedValue(mockFile);
      mockContentSanitizer.sanitizeContent.mockReturnValue({
        content: 'const secret = "[REDACTED]";',
        warnings: ['API key detected and redacted'],
        hasSecrets: true,
        hasPromptInjection: false,
        isMalicious: false,
        secretsDetected: ['api-key'],
      });

      await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'test',
        filePath: 'src/config.js',
      });

      expect(mockContentSanitizer.sanitizeContent).toHaveBeenCalled();
    });

    it('should minify content when requested', async () => {
      const mockFile = {
        data: {
          type: 'file',
          content: Buffer.from('function test() { return true; }').toString('base64'),
          size: 100,
          sha: 'abc123',
        },
      };
      
      mockOctokit.rest.repos.getContent.mockResolvedValue(mockFile);
      mockMinifyContentV2.mockResolvedValue({
        content: 'function test(){return!0}',
        failed: false,
        type: 'javascript',
      });

      await fetchGitHubFileContentAPI({
        owner: 'test',
        repo: 'test',
        filePath: 'src/test.js',
        minified: true,
      });

      expect(mockMinifyContentV2).toHaveBeenCalled();
    });
  });
});