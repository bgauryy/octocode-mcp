import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

const mockOctokitWithThrottling = vi.hoisted(() => {
  const MockClass = vi.fn().mockImplementation(() => mockOctokit) as any;
  MockClass.plugin = vi.fn().mockReturnValue(MockClass);
  return MockClass;
});

const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());
const mockCreateResult = vi.hoisted(() => vi.fn());
const mockContentSanitizer = vi.hoisted(() => ({
  sanitizeContent: vi.fn(),
}));
const mockMinifyContentV2 = vi.hoisted(() => vi.fn());
const mockOptimizeTextMatch = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('octokit', () => ({
  Octokit: mockOctokitWithThrottling,
  RequestError: class RequestError extends Error {
    public status: number;
    public request: any;
    public response?: any;

    constructor(
      message: string,
      statusCode: number,
      options: { request: any; response?: any }
    ) {
      super(message);
      this.name = 'HttpError';
      this.status = statusCode;
      this.request = options.request;
      this.response = options.response;
    }
  },
}));

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: vi.fn(),
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

vi.mock('../../src/mcp/responses.js', () => ({
  createResult: mockCreateResult,
  optimizeTextMatch: mockOptimizeTextMatch,
}));

vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: mockContentSanitizer,
}));

vi.mock('../../src/utils/minifier.js', () => ({
  minifyContentV2: mockMinifyContentV2,
}));

// Import after mocking
import {
  searchGitHubCodeAPI,
  searchGitHubReposAPI,
  fetchGitHubFileContentAPI,
  checkGitHubAuthAPI,
  viewGitHubRepositoryStructureAPI,
  searchGitHubPullRequestsAPI,
  searchGitHubIssuesAPI,
  searchGitHubCommitsAPI,
} from '../../src/utils/githubAPI.js';

describe('GitHub API Utils', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset Octokit mock implementation
    mockOctokitWithThrottling.mockImplementation(() => mockOctokit);

    // Set up default mock behaviors
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
    mockWithCache.mockImplementation(async (_key, fn) => await fn());
    mockCreateResult.mockImplementation(params => params);
    mockContentSanitizer.sanitizeContent.mockImplementation(content => ({
      content: content, // Return the content as-is for most tests
      warnings: [],
      hasSecrets: false,
      hasPromptInjection: false,
      isMalicious: false,
      secretsDetected: [],
    }));
    mockMinifyContentV2.mockResolvedValue({
      content: 'minified content',
      failed: false,
      type: 'javascript',
    });
    mockOptimizeTextMatch.mockImplementation(text => text);

    // Set up environment
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  describe('Basic Setup', () => {
    it('should import all API functions', () => {
      expect(searchGitHubCodeAPI).toBeDefined();
      expect(searchGitHubReposAPI).toBeDefined();
      expect(fetchGitHubFileContentAPI).toBeDefined();
      expect(checkGitHubAuthAPI).toBeDefined();
      expect(viewGitHubRepositoryStructureAPI).toBeDefined();
      expect(searchGitHubPullRequestsAPI).toBeDefined();
      expect(searchGitHubIssuesAPI).toBeDefined();
      expect(searchGitHubCommitsAPI).toBeDefined();
    });
  });

  describe('Authentication Check', () => {
    it('should check GitHub authentication successfully', async () => {
      const mockUserData = {
        data: {
          login: 'testuser',
          name: 'Test User',
          type: 'User',
        },
        headers: {
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-reset': '1640995200',
        },
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue(mockUserData);

      await checkGitHubAuthAPI();

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
            reset: '1640995200',
          },
        },
      });
    });

    it('should handle authentication failure', async () => {
      const { RequestError } = await import('octokit');
      const authError = new RequestError('Bad credentials', 401, {
        request: {} as any,
      });
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(authError);

      await checkGitHubAuthAPI();

      expect(mockCreateResult).toHaveBeenCalledWith({
        data: {
          authenticated: false,
          message: 'No valid authentication found',
          hint: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        },
      });
    });

    it('should handle other authentication errors', async () => {
      const { RequestError } = await import('octokit');
      const serverError = new RequestError('Server error', 500, {
        request: {} as any,
      });
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(serverError);

      await checkGitHubAuthAPI();

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: ['Authentication check failed: Server error'],
      });
    });

    it('should use custom token when provided', async () => {
      const mockUserData = {
        data: { login: 'testuser', name: 'Test User', type: 'User' },
        headers: {},
      };
      mockOctokit.rest.users.getAuthenticated.mockResolvedValue(mockUserData);

      await checkGitHubAuthAPI('custom-token');

      // Verify Octokit was created with custom token
      expect(mockOctokitWithThrottling).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: 'custom-token',
        })
      );
    });
  });

  describe('GitHub Code Search API', () => {
    it('should search GitHub code successfully', async () => {
      const mockSearchResponse = {
        data: {
          total_count: 1,
          items: [
            {
              path: 'src/components/Button.tsx',
              repository: {
                id: 12345,
                full_name: 'facebook/react',
                html_url: 'https://github.com/facebook/react',
                fork: false,
                private: false,
              },
              sha: 'abc123',
              html_url:
                'https://github.com/facebook/react/blob/main/src/components/Button.tsx',
              text_matches: [
                {
                  fragment:
                    'const Button = () => {\n  return <button>Click me</button>;\n}',
                  matches: [
                    {
                      text: 'Button',
                      indices: [6, 12],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      mockOctokit.rest.search.code.mockResolvedValue(mockSearchResponse);

      const params = {
        queryTerms: ['Button'],
        language: 'typescript',
        owner: 'facebook',
        repo: 'react',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(params);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'Button language:typescript repo:facebook/react',
        per_page: 30,
        page: 1,
      });

      expect(mockCreateResult).toHaveBeenCalledWith({
        data: expect.objectContaining({
          total_count: 1,
          items: expect.any(Array),
        }),
      });
    });

    it('should handle empty search query', async () => {
      const params = {
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(params);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: ['Search query cannot be empty'],
      });
    });

    it('should handle GitHub API rate limit error', async () => {
      const { RequestError } = await import('octokit');
      const rateLimitError = new RequestError('Rate limit exceeded', 403, {
        request: {} as any,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1640995200',
          },
        } as any,
      });

      mockOctokit.rest.search.code.mockRejectedValue(rateLimitError);

      const params = {
        queryTerms: ['test'],
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };
      await searchGitHubCodeAPI(params);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: expect.arrayContaining([
          'GitHub API rate limit exceeded',
          'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
        ]),
        data: expect.objectContaining({
          error: 'GitHub API rate limit exceeded',
          status: 403,
          type: 'http',
        }),
      });
    });

    it('should handle authentication error', async () => {
      const { RequestError } = await import('octokit');
      const authError = new RequestError('Bad credentials', 401, {
        request: {} as any,
      });

      mockOctokit.rest.search.code.mockRejectedValue(authError);

      const params = {
        queryTerms: ['test'],
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };
      await searchGitHubCodeAPI(params);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          'GitHub authentication required',
          'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        ],
        data: expect.objectContaining({
          error: 'GitHub authentication required',
          status: 401,
          type: 'http',
        }),
      });
    });

    it('should handle validation error', async () => {
      const { RequestError } = await import('octokit');
      const validationError = new RequestError('Validation failed', 422, {
        request: {} as any,
      });

      mockOctokit.rest.search.code.mockRejectedValue(validationError);

      const params = {
        queryTerms: ['test'],
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };
      await searchGitHubCodeAPI(params);

      expect(mockCreateResult).toHaveBeenCalledWith({
        isError: true,
        hints: [
          'Invalid search query or request parameters',
          'Check search syntax and parameter values',
          'Ensure search query follows GitHub search syntax.',
        ],
        data: expect.objectContaining({
          error: 'Invalid search query or request parameters',
          status: 422,
          type: 'http',
        }),
      });
    });

    it('should build complex search queries correctly', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      const params = {
        queryTerms: ['function', 'export'],
        language: 'javascript',
        owner: 'microsoft',
        repo: 'vscode',
        filename: 'index.js',
        extension: 'js',
        path: 'src',
        size: '>1000',
        match: ['file'] as ('file' | 'path')[],
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(params);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function export language:javascript repo:microsoft/vscode filename:index.js extension:js path:src size:>1000 in:file',
        per_page: 30,
        page: 1,
      });
    });

    it('should handle user vs org distinction', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      // Test user qualifier
      const userParams = {
        queryTerms: ['function'],
        user: 'octocat',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(userParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function user:octocat',
        per_page: 30,
        page: 1,
      });

      // Test org qualifier
      const orgParams = {
        queryTerms: ['function'],
        org: 'github',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(orgParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function org:github',
        per_page: 30,
        page: 1,
      });

      // Test both user and org
      const bothParams = {
        queryTerms: ['function'],
        user: 'octocat',
        org: 'github',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(bothParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function user:octocat org:github',
        per_page: 30,
        page: 1,
      });
    });

    it('should handle fork qualifier', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      // Test fork:true
      const forkTrueParams = {
        queryTerms: ['function'],
        fork: 'true' as const,
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(forkTrueParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function fork:true',
        per_page: 30,
        page: 1,
      });

      // Test fork:false
      const forkFalseParams = {
        queryTerms: ['function'],
        fork: 'false' as const,
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(forkFalseParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function fork:false',
        per_page: 30,
        page: 1,
      });

      // Test fork:only
      const forkOnlyParams = {
        queryTerms: ['function'],
        fork: 'only' as const,
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(forkOnlyParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function fork:only',
        per_page: 30,
        page: 1,
      });
    });

    it('should handle archived qualifier', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      // Test archived:true
      const archivedTrueParams = {
        queryTerms: ['function'],
        archived: true,
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(archivedTrueParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function archived:true',
        per_page: 30,
        page: 1,
      });

      // Test archived:false
      const archivedFalseParams = {
        queryTerms: ['function'],
        archived: false,
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(archivedFalseParams);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function archived:false',
        per_page: 30,
        page: 1,
      });
    });

    it('should prioritize owner+repo over user/org qualifiers', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      // When both owner+repo and user/org are provided, owner+repo should take precedence
      const params = {
        queryTerms: ['function'],
        owner: 'facebook',
        repo: 'react',
        user: 'octocat',
        org: 'github',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(params);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function repo:facebook/react',
        per_page: 30,
        page: 1,
      });
    });

    it('should handle all new qualifiers together', async () => {
      mockOctokit.rest.search.code.mockResolvedValue({
        data: { total_count: 0, items: [] },
      });

      const params = {
        queryTerms: ['function'],
        user: 'octocat',
        org: 'github',
        fork: 'true' as const,
        archived: false,
        language: 'javascript',
        minify: true,
        sanitize: true,
        researchGoal: 'code_analysis' as const,
      };

      await searchGitHubCodeAPI(params);

      expect(mockOctokit.rest.search.code).toHaveBeenCalledWith({
        q: 'function language:javascript user:octocat org:github fork:true archived:false',
        per_page: 30,
        page: 1,
      });
    });

    describe('GitHub Repository Search API', () => {
      it('should search GitHub repositories successfully', async () => {
        const mockRepoResponse = {
          data: {
            total_count: 1,
            items: [
              {
                full_name: 'facebook/react',
                stargazers_count: 50000,
                description:
                  'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
                language: 'JavaScript',
                html_url: 'https://github.com/facebook/react',
                forks_count: 15000,
                updated_at: '2023-12-01T10:00:00Z',
                owner: { login: 'facebook' },
              },
            ],
          },
        };

        mockOctokit.rest.search.repos.mockResolvedValue(mockRepoResponse);

        const params = {
          queryTerms: ['react'],
          language: 'javascript',
          stars: '>1000',
        };

        await searchGitHubReposAPI(params);

        expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith({
          q: 'react language:javascript stars:>1000',
          per_page: 30,
          page: 1,
        });

        expect(mockCreateResult).toHaveBeenCalledWith({
          data: {
            total_count: 1,
            repositories: [
              {
                name: 'facebook/react',
                stars: 50000,
                description:
                  'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
                language: 'JavaScript',
                url: 'https://github.com/facebook/react',
                forks: 15000,
                updatedAt: '01/12/2023',
                owner: 'facebook',
              },
            ],
          },
        });
      });

      it('should handle empty search query for repositories', async () => {
        const params = {};
        await searchGitHubReposAPI(params);

        expect(mockCreateResult).toHaveBeenCalledWith({
          isError: true,
          hints: [
            'Search query cannot be empty. Provide queryTerms, exactQuery, or filters.',
          ],
        });
      });

      it('should build complex repository search queries', async () => {
        mockOctokit.rest.search.repos.mockResolvedValue({
          data: { total_count: 0, items: [] },
        });

        const params = {
          queryTerms: ['machine', 'learning'],
          exactQuery: 'tensorflow',
          language: 'python',
          owner: ['google', 'microsoft'],
          topic: ['ml', 'ai'],
          stars: '>100',
          forks: '10..50',
          size: '<1000',
          created: '>2020-01-01',
          updated: '<2023-12-31',
          archived: false,
          'include-forks': 'false' as const,
          license: 'mit',
          'good-first-issues': '>5',
          'help-wanted-issues': '>0',
          followers: '>1000',
          'number-topics': '>=3',
          match: ['name', 'description'] as (
            | 'name'
            | 'description'
            | 'readme'
          )[],
          sort: 'stars' as const,
          order: 'desc' as const,
        };

        await searchGitHubReposAPI(params);

        const expectedQuery =
          'machine learning "tensorflow" language:python user:google user:microsoft topic:ml topic:ai stars:>100 forks:10..50 size:<1000 created:>2020-01-01 pushed:<2023-12-31 archived:false fork:false license:mit good-first-issues:>5 help-wanted-issues:>0 followers:>1000 topics:>=3 in:name in:description';

        expect(mockOctokit.rest.search.repos).toHaveBeenCalledWith({
          q: expectedQuery,
          per_page: 30,
          page: 1,
          sort: 'stars',
          order: 'desc',
        });
      });

      it('should handle repository search rate limit error', async () => {
        const { RequestError } = await import('octokit');
        const rateLimitError = new RequestError('Rate limit exceeded', 403, {
          request: {} as any,
          response: {
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': '1640995200',
            },
          } as any,
        });

        mockOctokit.rest.search.repos.mockRejectedValue(rateLimitError);

        const params = { queryTerms: ['test'] };
        await searchGitHubReposAPI(params);

        expect(mockCreateResult).toHaveBeenCalledWith({
          isError: true,
          hints: expect.arrayContaining([
            'GitHub API rate limit exceeded',
            'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
          ]),
          data: expect.objectContaining({
            error: 'GitHub API rate limit exceeded',
            status: 403,
            type: 'http',
          }),
        });
      });

      it('should truncate long descriptions', async () => {
        const longDescription =
          'This is a very long description that exceeds the 150 character limit and should be truncated with ellipsis to keep the output manageable and readable for users who are browsing repositories.';

        const mockRepoResponse = {
          data: {
            total_count: 1,
            items: [
              {
                full_name: 'test/repo',
                stargazers_count: 100,
                description: longDescription,
                language: 'JavaScript',
                html_url: 'https://github.com/test/repo',
                forks_count: 10,
                updated_at: '2023-12-01T10:00:00Z',
                owner: { login: 'test' },
              },
            ],
          },
        };

        mockOctokit.rest.search.repos.mockResolvedValue(mockRepoResponse);

        const params = { queryTerms: ['test'] };
        await searchGitHubReposAPI(params);

        expect(mockCreateResult).toHaveBeenCalledWith({
          data: expect.objectContaining({
            repositories: [
              expect.objectContaining({
                description: longDescription.substring(0, 150) + '...',
              }),
            ],
          }),
        });
      });

      describe('GitHub File Content API', () => {
        it('should fetch file content successfully', async () => {
          const fileContent = 'const greeting = "Hello, World!";';
          const base64Content = Buffer.from(fileContent).toString('base64');

          const mockFileResponse = {
            data: {
              type: 'file',
              content: base64Content,
              size: fileContent.length,
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileResponse);

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'src/index.js',
            branch: 'main',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
            owner: 'facebook',
            repo: 'react',
            path: 'src/index.js',
            ref: 'main',
          });

          expect(mockCreateResult).toHaveBeenCalledWith({
            data: expect.objectContaining({
              filePath: 'src/index.js',
              owner: 'facebook',
              repo: 'react',
              branch: 'main',
              content: 'minified content', // Content gets minified by default
              totalLines: 1,
              minified: true,
              minificationFailed: false,
              minificationType: 'javascript',
            }),
          });
        });

        it('should handle directory instead of file', async () => {
          const mockDirectoryResponse = {
            data: [
              { name: 'file1.js', type: 'file' },
              { name: 'file2.js', type: 'file' },
            ],
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(
            mockDirectoryResponse
          );

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'src',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            isError: true,
            hints: [
              'Path is a directory. Use githubViewRepoStructure to list directory contents',
            ],
          });
        });

        it('should handle file too large', async () => {
          const mockLargeFileResponse = {
            data: {
              type: 'file',
              content: 'base64content',
              size: 400 * 1024, // 400KB - exceeds 300KB limit
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(
            mockLargeFileResponse
          );

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'large-file.js',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            isError: true,
            hints: [expect.stringContaining('File too large (400KB > 300KB)')],
          });
        });

        it('should handle binary file detection', async () => {
          // Create binary content with null bytes
          const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
          const base64Content = binaryContent.toString('base64');

          const mockBinaryResponse = {
            data: {
              type: 'file',
              content: base64Content,
              size: binaryContent.length,
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(
            mockBinaryResponse
          );

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'binary-file.png',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            isError: true,
            hints: [
              'Binary file detected. Cannot display as text - download directly from GitHub',
            ],
          });
        });

        it('should handle partial file content with line ranges', async () => {
          const fileContent = 'line1\nline2\nline3\nline4\nline5';
          const base64Content = Buffer.from(fileContent).toString('base64');

          const mockFileResponse = {
            data: {
              type: 'file',
              content: base64Content,
              size: fileContent.length,
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileResponse);

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'src/index.js',
            startLine: 2,
            endLine: 4,
            contextLines: 1,
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            data: expect.objectContaining({
              isPartial: true,
              startLine: 1, // contextLines adjusts this
              endLine: 5, // contextLines adjusts this
              requestedStartLine: 2,
              requestedEndLine: 4,
              requestedContextLines: 1,
              totalLines: 5,
            }),
          });
        });

        it('should handle match string search', async () => {
          const fileContent =
            'function test() {\n  console.log("hello");\n  return true;\n}';
          const base64Content = Buffer.from(fileContent).toString('base64');

          const mockFileResponse = {
            data: {
              type: 'file',
              content: base64Content,
              size: fileContent.length,
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileResponse);

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'src/test.js',
            matchString: 'console.log',
            contextLines: 2,
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            data: expect.objectContaining({
              isPartial: true,
              securityWarnings: expect.arrayContaining([
                expect.stringContaining('Found "console.log" on line 2'),
              ]),
            }),
          });
        });

        it('should handle match string not found', async () => {
          const fileContent = 'function test() {\n  return true;\n}';
          const base64Content = Buffer.from(fileContent).toString('base64');

          const mockFileResponse = {
            data: {
              type: 'file',
              content: base64Content,
              size: fileContent.length,
              sha: 'abc123',
            },
          };

          mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileResponse);

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'src/test.js',
            matchString: 'nonexistent',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            isError: true,
            hints: [
              'Match string "nonexistent" not found in file. The file may have changed since the search was performed.',
            ],
          });
        });

        it('should handle file not found error', async () => {
          const { RequestError } = await import('octokit');
          const notFoundError = new RequestError('Not Found', 404, {
            request: {} as any,
          });

          mockOctokit.rest.repos.getContent.mockRejectedValue(notFoundError);

          const params = {
            owner: 'facebook',
            repo: 'react',
            filePath: 'nonexistent.js',
            minified: true,
          };

          await fetchGitHubFileContentAPI(params);

          expect(mockCreateResult).toHaveBeenCalledWith({
            isError: true,
            hints: [
              'Repository, resource, or path not found',
              'Verify the file path, repository name, and branch exist.',
            ],
            data: expect.objectContaining({
              error: 'Repository, resource, or path not found',
              status: 404,
              type: 'http',
            }),
          });
        });

        describe('GitHub Repository Structure API', () => {
          it('should view repository structure successfully', async () => {
            const mockStructureResponse = {
              data: [
                {
                  name: 'src',
                  path: 'src',
                  type: 'dir',
                  url: 'https://api.github.com/repos/facebook/react/contents/src',
                  html_url: 'https://github.com/facebook/react/tree/main/src',
                  git_url:
                    'https://api.github.com/repos/facebook/react/git/trees/abc123',
                  sha: 'abc123',
                },
                {
                  name: 'package.json',
                  path: 'package.json',
                  type: 'file',
                  size: 2048,
                  url: 'https://api.github.com/repos/facebook/react/contents/package.json',
                  html_url:
                    'https://github.com/facebook/react/blob/main/package.json',
                  git_url:
                    'https://api.github.com/repos/facebook/react/git/blobs/def456',
                  download_url:
                    'https://raw.githubusercontent.com/facebook/react/main/package.json',
                  sha: 'def456',
                },
              ],
            };

            mockOctokit.rest.repos.getContent.mockResolvedValue(
              mockStructureResponse
            );

            const params = {
              owner: 'facebook',
              repo: 'react',
              branch: 'main',
              path: '',
              depth: 1,
              includeIgnored: false,
              showMedia: false,
            };

            await viewGitHubRepositoryStructureAPI(params);

            expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
              owner: 'facebook',
              repo: 'react',
              path: undefined,
              ref: 'main',
            });

            expect(mockCreateResult).toHaveBeenCalledWith({
              data: expect.objectContaining({
                repository: 'facebook/react',
                branch: 'main',
                path: '/',
                depth: 1,
                apiSource: true,
                summary: expect.objectContaining({
                  totalFiles: 1,
                  totalFolders: 1,
                }),
                files: expect.objectContaining({
                  count: 1,
                  files: expect.arrayContaining([
                    expect.objectContaining({
                      name: 'package.json',
                      path: 'package.json',
                      size: 2048,
                    }),
                  ]),
                }),
                folders: expect.objectContaining({
                  count: 1,
                  folders: expect.arrayContaining([
                    expect.objectContaining({
                      name: 'src',
                      path: 'src',
                    }),
                  ]),
                }),
              }),
            });
          });

          it('should handle repository not found', async () => {
            const { RequestError } = await import('octokit');
            const notFoundError = new RequestError('Not Found', 404, {
              request: {} as any,
            });

            mockOctokit.rest.repos.getContent.mockRejectedValue(notFoundError);
            mockOctokit.rest.repos.get.mockRejectedValue(notFoundError);

            const params = {
              owner: 'nonexistent',
              repo: 'repo',
              branch: 'main',
            };

            await viewGitHubRepositoryStructureAPI(params);

            expect(mockCreateResult).toHaveBeenCalledWith({
              isError: true,
              data: expect.objectContaining({
                error: expect.stringContaining(
                  'Repository "nonexistent/repo" not found'
                ),
              }),
            });
          });

          it('should try fallback branches when main branch not found', async () => {
            const { RequestError } = await import('octokit');
            const notFoundError = new RequestError('Not Found', 404, {
              request: {} as any,
            });

            // First call fails (requested branch)
            // Second call fails (default branch)
            // Third call succeeds (fallback branch)
            mockOctokit.rest.repos.getContent
              .mockRejectedValueOnce(notFoundError)
              .mockRejectedValueOnce(notFoundError)
              .mockResolvedValueOnce({
                data: [
                  {
                    name: 'README.md',
                    path: 'README.md',
                    type: 'file',
                    size: 1024,
                    url: 'https://api.github.com/repos/test/repo/contents/README.md',
                    html_url:
                      'https://github.com/test/repo/blob/master/README.md',
                    git_url:
                      'https://api.github.com/repos/test/repo/git/blobs/xyz789',
                    download_url:
                      'https://raw.githubusercontent.com/test/repo/master/README.md',
                    sha: 'xyz789',
                  },
                ],
              });

            mockOctokit.rest.repos.get.mockResolvedValue({
              data: {
                name: 'repo',
                full_name: 'test/repo',
                default_branch: 'main',
                private: false,
              },
            });

            const params = {
              owner: 'test',
              repo: 'repo',
              branch: 'nonexistent-branch',
            };

            await viewGitHubRepositoryStructureAPI(params);

            expect(mockCreateResult).toHaveBeenCalledWith({
              data: expect.objectContaining({
                branch: 'master', // Should use the fallback branch that worked
              }),
            });
          });
        });

        describe('GitHub Pull Requests API', () => {
          it('should search pull requests successfully', async () => {
            const mockPRResponse = {
              data: {
                total_count: 1,
                items: [
                  {
                    number: 123,
                    title: 'Fix bug in component',
                    body: 'This PR fixes a critical bug',
                    state: 'open',
                    user: { login: 'developer' },
                    repository_url:
                      'https://api.github.com/repos/facebook/react',
                    labels: [{ name: 'bug' }, { name: 'priority-high' }],
                    created_at: '2023-12-01T10:00:00Z',
                    updated_at: '2023-12-02T15:30:00Z',
                    html_url: 'https://github.com/facebook/react/pull/123',
                    reactions: { total_count: 5 },
                    draft: false,
                    pull_request: {},
                  },
                ],
              },
            };

            mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(
              mockPRResponse
            );

            const params = {
              query: 'bug fix',
              state: 'open' as const,
              owner: 'facebook',
              repo: 'react',
            };

            await searchGitHubPullRequestsAPI(params);

            expect(
              mockOctokit.rest.search.issuesAndPullRequests
            ).toHaveBeenCalledWith({
              q: 'bug fix is:pr repo:facebook/react is:open',
              sort: undefined,
              order: 'desc',
              per_page: 30,
            });

            expect(mockCreateResult).toHaveBeenCalledWith({
              data: expect.objectContaining({
                results: expect.arrayContaining([
                  expect.objectContaining({
                    number: 123,
                    title: 'Fix bug in component',
                    state: 'open',
                    author: 'developer',
                    repository: 'facebook/react',
                    labels: ['bug', 'priority-high'],
                    reactions: 5,
                    draft: false,
                  }),
                ]),
                total_count: 1,
                apiSource: true,
              }),
            });
          });

          it('should handle empty PR search query (returns all PRs)', async () => {
            // Mock the search to return an empty result
            mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
              data: { total_count: 0, items: [] },
            });

            const params = {};
            await searchGitHubPullRequestsAPI(params);

            // Should search with just "is:pr" query
            expect(
              mockOctokit.rest.search.issuesAndPullRequests
            ).toHaveBeenCalledWith({
              q: 'is:pr',
              sort: undefined,
              order: 'desc',
              per_page: 30,
            });

            expect(mockCreateResult).toHaveBeenCalledWith({
              data: expect.objectContaining({
                results: [],
                total_count: 0,
                apiSource: true,
              }),
            });
          });

          it('should build complex PR search queries', async () => {
            mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
              data: { total_count: 0, items: [] },
            });

            const params = {
              query: 'feature request',
              state: 'closed' as const,
              draft: false,
              merged: true,
              author: 'maintainer',
              assignee: 'reviewer',
              mentions: 'contributor',
              commenter: 'user',
              involves: 'team-member',
              'reviewed-by': 'senior-dev',
              'review-requested': 'code-owner',
              head: 'feature-branch',
              base: 'main',
              created: '>2023-01-01',
              updated: '<2023-12-31',
              'merged-at': '2023-06-01..2023-06-30',
              closed: '>2023-07-01',
              comments: '>5',
              reactions: '>=10',
              interactions: '>20',
              review: 'approved' as const,
              checks: 'success' as const,
              label: ['enhancement', 'priority-medium'],
              milestone: 'v2.0',
              'team-mentions': 'frontend-team',
              'no-assignee': true,
              'no-label': false,
              'no-milestone': false,
              'no-project': true,
              language: 'typescript',
              visibility: ['public'] as ('public' | 'private' | 'internal')[],
            };

            await searchGitHubPullRequestsAPI(params);

            const expectedQuery =
              'feature request is:pr is:closed -is:draft is:merged author:maintainer assignee:reviewer mentions:contributor commenter:user involves:team-member reviewed-by:senior-dev review-requested:code-owner head:feature-branch base:main created:>2023-01-01 updated:<2023-12-31 merged:2023-06-01..2023-06-30 closed:>2023-07-01 comments:>5 reactions:>=10 interactions:>20 review:approved status:success label:"enhancement" label:"priority-medium" milestone:"v2.0" team:frontend-team no:assignee no:project language:typescript is:public';

            expect(
              mockOctokit.rest.search.issuesAndPullRequests
            ).toHaveBeenCalledWith({
              q: expectedQuery,
              sort: undefined,
              order: 'desc',
              per_page: 30,
            });
          });

          describe('GitHub Issues API', () => {
            it('should search GitHub issues successfully', async () => {
              const mockIssueResponse = {
                data: {
                  total_count: 1,
                  items: [
                    {
                      number: 456,
                      title: 'Bug report: Component not rendering',
                      body: 'The component fails to render in certain conditions',
                      state: 'open',
                      user: {
                        login: 'reporter',
                        id: 12345,
                        html_url: 'https://github.com/reporter',
                        type: 'User',
                      },
                      repository_url:
                        'https://api.github.com/repos/facebook/react',
                      labels: [
                        {
                          name: 'bug',
                          color: 'red',
                          description: 'Bug report',
                          id: 1,
                        },
                        {
                          name: 'needs-triage',
                          color: 'yellow',
                          description: 'Needs triage',
                          id: 2,
                        },
                      ],
                      created_at: '2023-12-01T10:00:00Z',
                      updated_at: '2023-12-02T15:30:00Z',
                      html_url: 'https://github.com/facebook/react/issues/456',
                      comments: 3,
                      reactions: { total_count: 8 },
                      locked: false,
                      assignees: [
                        {
                          login: 'maintainer',
                          id: 67890,
                          html_url: 'https://github.com/maintainer',
                          type: 'User',
                        },
                      ],
                      author_association: 'CONTRIBUTOR',
                      id: 789012,
                    },
                  ],
                },
              };

              mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue(
                mockIssueResponse
              );

              const params = {
                query: 'bug report',
                state: 'open' as const,
                owner: 'facebook',
                repo: 'react',
              };

              await searchGitHubIssuesAPI(params);

              expect(
                mockOctokit.rest.search.issuesAndPullRequests
              ).toHaveBeenCalledWith({
                q: 'bug report is:issue repo:facebook/react is:open',
                sort: undefined,
                order: 'desc',
                per_page: 25,
              });

              expect(mockCreateResult).toHaveBeenCalledWith({
                data: expect.objectContaining({
                  results: expect.arrayContaining([
                    expect.objectContaining({
                      number: 456,
                      title: 'Bug report: Component not rendering',
                      state: 'open',
                      author: expect.objectContaining({
                        login: 'reporter',
                        id: '12345',
                        is_bot: false,
                      }),
                      repository: expect.objectContaining({
                        nameWithOwner: 'facebook/react',
                      }),
                      labels: expect.arrayContaining([
                        expect.objectContaining({
                          name: 'bug',
                          color: 'red',
                        }),
                      ]),
                      commentsCount: 3,
                      reactions: 8,
                      isLocked: false,
                      isPullRequest: false,
                    }),
                  ]),
                  apiSource: true,
                }),
              });
            });

            it('should handle including pull requests in issue search', async () => {
              mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
                data: { total_count: 0, items: [] },
              });

              const params = {
                query: 'enhancement',
                'include-prs': true,
              };

              await searchGitHubIssuesAPI(params);

              expect(
                mockOctokit.rest.search.issuesAndPullRequests
              ).toHaveBeenCalledWith({
                q: 'enhancement',
                sort: undefined,
                order: 'desc',
                per_page: 25,
              });
            });

            it('should build complex issue search queries', async () => {
              mockOctokit.rest.search.issuesAndPullRequests.mockResolvedValue({
                data: { total_count: 0, items: [] },
              });

              const params = {
                query: 'performance issue',
                state: 'closed' as const,
                author: 'contributor',
                assignee: 'maintainer',
                mentions: 'reviewer',
                commenter: 'user',
                involves: 'team-member',
                created: '>2023-01-01',
                updated: '<2023-12-31',
                closed: '2023-06-01..2023-06-30',
                comments: '>10',
                reactions: '>=5',
                interactions: '>50',
                label: ['performance', 'needs-investigation'],
                milestone: 'v3.0',
                'team-mentions': 'performance-team',
                'no-assignee': false,
                'no-label': false,
                'no-milestone': false,
                'no-project': true,
                language: 'javascript',
                visibility: 'public' as const,
                app: 'dependabot',
                archived: false,
              };

              await searchGitHubIssuesAPI(params);

              const expectedQuery =
                'performance issue is:issue is:closed author:contributor assignee:maintainer mentions:reviewer commenter:user involves:team-member created:>2023-01-01 updated:<2023-12-31 closed:2023-06-01..2023-06-30 comments:>10 reactions:>=5 interactions:>50 label:"performance" label:"needs-investigation" milestone:"v3.0" team:performance-team no:project language:javascript is:public app:dependabot -is:archived';

              expect(
                mockOctokit.rest.search.issuesAndPullRequests
              ).toHaveBeenCalledWith({
                q: expectedQuery,
                sort: undefined,
                order: 'desc',
                per_page: 25,
              });
            });
          });

          describe('GitHub Commits API', () => {
            it('should search GitHub commits successfully', async () => {
              const mockCommitResponse = {
                data: {
                  total_count: 1,
                  items: [
                    {
                      sha: 'abc123def456',
                      commit: {
                        message: 'Fix critical bug in authentication',
                        author: {
                          name: 'Developer Name',
                          email: 'dev@example.com',
                          date: '2023-12-01T10:00:00Z',
                        },
                        committer: {
                          name: 'GitHub',
                          email: 'noreply@github.com',
                          date: '2023-12-01T10:00:00Z',
                        },
                      },
                      author: {
                        login: 'developer',
                        id: 12345,
                        url: 'https://api.github.com/users/developer',
                      },
                      committer: {
                        login: 'github-actions',
                        id: 67890,
                        url: 'https://api.github.com/users/github-actions',
                      },
                      repository: {
                        fullName: 'facebook/react',
                        description:
                          'A JavaScript library for building user interfaces',
                      },
                      url: 'https://api.github.com/repos/facebook/react/commits/abc123def456',
                    },
                  ],
                },
              };

              mockOctokit.rest.search.commits.mockResolvedValue(
                mockCommitResponse
              );

              const params = {
                queryTerms: ['fix', 'bug'],
                owner: 'facebook',
                repo: 'react',
              };

              await searchGitHubCommitsAPI(params);

              expect(mockOctokit.rest.search.commits).toHaveBeenCalledWith({
                q: 'fix bug repo:facebook/react',
                sort: 'committer-date',
                order: 'desc',
                per_page: 25,
                page: 1,
              });

              expect(mockCreateResult).toHaveBeenCalledWith({
                data: expect.objectContaining({
                  commits: expect.arrayContaining([
                    expect.objectContaining({
                      sha: 'abc123def456',
                      message: 'Fix critical bug in authentication',
                      author: 'Developer Name',
                      date: '01/12/2023',
                      url: 'abc123def456', // Single repo format
                    }),
                  ]),
                  total_count: 1,
                  repository: expect.objectContaining({
                    name: 'facebook/react',
                    description:
                      'A JavaScript library for building user interfaces',
                  }),
                  apiSource: true,
                }),
              });
            });

            it('should handle commit search with diff content', async () => {
              const mockCommitResponse = {
                data: {
                  total_count: 1,
                  items: [
                    {
                      sha: 'xyz789',
                      commit: {
                        message: 'Update component logic',
                        author: {
                          name: 'Dev User',
                          email: 'dev@test.com',
                          date: '2023-12-01T10:00:00Z',
                        },
                        committer: {
                          name: 'Dev User',
                          email: 'dev@test.com',
                          date: '2023-12-01T10:00:00Z',
                        },
                      },
                      author: {
                        login: 'devuser',
                        id: 111,
                        url: 'https://api.github.com/users/devuser',
                      },
                      committer: {
                        login: 'devuser',
                        id: 111,
                        url: 'https://api.github.com/users/devuser',
                      },
                      repository: {
                        fullName: 'test/repo',
                        description: 'Test repository',
                      },
                      url: 'https://api.github.com/repos/test/repo/commits/xyz789',
                    },
                  ],
                },
              };

              const mockCommitDetails = {
                data: {
                  files: [
                    {
                      filename: 'src/component.js',
                      status: 'modified',
                      additions: 10,
                      deletions: 5,
                      changes: 15,
                      patch:
                        '@@ -1,3 +1,4 @@\n function test() {\n+  console.log("debug");\n   return true;\n }',
                    },
                  ],
                  stats: {
                    additions: 10,
                    deletions: 5,
                    total: 15,
                  },
                },
              };

              mockOctokit.rest.search.commits.mockResolvedValue(
                mockCommitResponse
              );
              mockOctokit.rest.repos.getCommit.mockResolvedValue(
                mockCommitDetails
              );

              const params = {
                queryTerms: ['update'],
                owner: 'test',
                repo: 'repo',
                getChangesContent: true,
              };

              await searchGitHubCommitsAPI(params);

              expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalledWith({
                owner: 'test',
                repo: 'repo',
                ref: 'xyz789',
              });

              expect(mockCreateResult).toHaveBeenCalledWith({
                data: expect.objectContaining({
                  commits: expect.arrayContaining([
                    expect.objectContaining({
                      sha: 'xyz789',
                      diff: expect.objectContaining({
                        changed_files: 1,
                        additions: 10,
                        deletions: 5,
                        total_changes: 15,
                        files: expect.arrayContaining([
                          expect.objectContaining({
                            filename: 'src/component.js',
                            status: 'modified',
                            patch: expect.stringContaining('function test()'),
                          }),
                        ]),
                      }),
                    }),
                  ]),
                }),
              });
            });

            it('should build complex commit search queries', async () => {
              mockOctokit.rest.search.commits.mockResolvedValue({
                data: { total_count: 0, items: [] },
              });

              const params = {
                exactQuery: 'security fix',
                author: 'security-team',
                'author-name': 'Security Bot',
                'author-email': 'security@company.com',
                committer: 'github-actions',
                'committer-name': 'GitHub Actions',
                'committer-email': 'actions@github.com',
                'author-date': '>2023-01-01',
                'committer-date': '<2023-12-31',
                hash: 'abc123',
                parent: 'def456',
                tree: 'ghi789',
                merge: false,
                visibility: 'public' as const,
                sort: 'author-date' as const,
                order: 'asc' as const,
              };

              await searchGitHubCommitsAPI(params);

              const expectedQuery =
                '"security fix" author:security-team author-name:"Security Bot" author-email:security@company.com committer:github-actions committer-name:"GitHub Actions" committer-email:actions@github.com author-date:>2023-01-01 committer-date:<2023-12-31 hash:abc123 parent:def456 tree:ghi789 merge:false is:public';

              expect(mockOctokit.rest.search.commits).toHaveBeenCalledWith({
                q: expectedQuery,
                sort: 'author-date',
                order: 'asc',
                per_page: 25,
                page: 1,
              });
            });
          });
        });
      });
    });
  });
});
