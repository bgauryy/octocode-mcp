/**
 * Tests for Provider Execution Layer
 *
 * Tests the execute.ts module which routes requests to the appropriate provider.
 *
 * @module tests/providers/execute
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  ProviderType,
  ProviderResponse,
  CodeSearchResult,
  FileContentResult,
  RepoSearchResult,
  PullRequestSearchResult,
  RepoStructureResult,
  ICodeHostProvider,
  CodeSearchQuery,
  FileContentQuery,
  RepoSearchQuery,
  PullRequestQuery,
  RepoStructureQuery,
} from '../../src/providers/types.js';

// Mock the factory module
vi.mock('../../src/providers/factory.js', () => ({
  getProvider: vi.fn(),
  extractProviderFromQuery: vi.fn(
    (query: { provider?: ProviderType }) => query.provider || 'github'
  ),
  DEFAULT_PROVIDER: 'github' as ProviderType,
}));

import {
  executeCodeSearch,
  executeGetFileContent,
  executeRepoSearch,
  executePullRequestSearch,
  executeGetRepoStructure,
  createExecutionOptions,
  isValidProvider,
  getDefaultProvider,
  legacyToUnified,
  unifiedToLegacy,
} from '../../src/providers/execute.js';
import {
  getProvider,
  extractProviderFromQuery,
  DEFAULT_PROVIDER,
} from '../../src/providers/factory.js';

const mockGetProvider = vi.mocked(getProvider);
const mockExtractProviderFromQuery = vi.mocked(extractProviderFromQuery);

// Helper to create mock provider
function createMockProvider(type: ProviderType = 'github'): ICodeHostProvider {
  return {
    type,
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  };
}

// Helper to create mock code search result
function createMockCodeSearchResult(): ProviderResponse<CodeSearchResult> {
  return {
    data: {
      items: [
        {
          path: 'src/index.ts',
          matches: [{ context: 'const foo = bar;', positions: [[6, 9]] }],
          url: 'https://github.com/owner/repo/blob/main/src/index.ts',
          repository: {
            id: '123',
            name: 'repo',
            url: 'https://github.com/owner/repo',
          },
        },
      ],
      totalCount: 1,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    status: 200,
    provider: 'github',
  };
}

// Helper to create mock file content result
function createMockFileContentResult(): ProviderResponse<FileContentResult> {
  return {
    data: {
      path: 'src/index.ts',
      content: 'const foo = "bar";',
      encoding: 'utf-8',
      size: 18,
      ref: 'main',
    },
    status: 200,
    provider: 'github',
  };
}

// Helper to create mock repo search result
function createMockRepoSearchResult(): ProviderResponse<RepoSearchResult> {
  return {
    data: {
      repositories: [
        {
          id: '123',
          name: 'test-repo',
          fullPath: 'owner/test-repo',
          description: 'A test repository',
          url: 'https://github.com/owner/test-repo',
          cloneUrl: 'https://github.com/owner/test-repo.git',
          defaultBranch: 'main',
          stars: 100,
          forks: 10,
          visibility: 'public',
          topics: ['typescript', 'test'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
          lastActivityAt: '2024-06-01T00:00:00Z',
        },
      ],
      totalCount: 1,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    status: 200,
    provider: 'github',
  };
}

// Helper to create mock pull request search result
function createMockPullRequestSearchResult(): ProviderResponse<PullRequestSearchResult> {
  return {
    data: {
      items: [
        {
          number: 123,
          title: 'Test PR',
          body: 'Test description',
          url: 'https://github.com/owner/repo/pull/123',
          state: 'open',
          draft: false,
          author: 'testuser',
          assignees: [],
          labels: ['bug'],
          sourceBranch: 'feature',
          targetBranch: 'main',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
      totalCount: 1,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    status: 200,
    provider: 'github',
  };
}

// Helper to create mock repo structure result
function createMockRepoStructureResult(): ProviderResponse<RepoStructureResult> {
  return {
    data: {
      projectPath: 'owner/repo',
      branch: 'main',
      path: '',
      structure: {
        '.': { files: ['README.md', 'package.json'], folders: ['src'] },
        src: { files: ['index.ts'], folders: [] },
      },
      summary: { totalFiles: 3, totalFolders: 1, truncated: false },
    },
    status: 200,
    provider: 'github',
  };
}

describe('Provider Execute Module', () => {
  let mockProvider: ICodeHostProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = createMockProvider('github');
    mockGetProvider.mockReturnValue(mockProvider);
    mockExtractProviderFromQuery.mockImplementation(
      (query: { provider?: ProviderType }) => query.provider || 'github'
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // executeCodeSearch Tests
  // ============================================================================

  describe('executeCodeSearch', () => {
    it('should execute code search with default provider (github)', async () => {
      const mockResult = createMockCodeSearchResult();
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: CodeSearchQuery = {
        keywords: ['useState', 'useEffect'],
        projectId: 'facebook/react',
      };

      const result = await executeCodeSearch(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(mockProvider.searchCode).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should execute code search with gitlab provider', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');

      const mockResult = {
        ...createMockCodeSearchResult(),
        provider: 'gitlab' as ProviderType,
      };
      (gitlabProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: CodeSearchQuery = {
        provider: 'gitlab',
        keywords: ['pipeline'],
        projectId: 'gitlab-org/gitlab',
      };

      const result = await executeCodeSearch(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('gitlab', {
        type: 'gitlab',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(gitlabProvider.searchCode).toHaveBeenCalledWith(query);
      expect(result.provider).toBe('gitlab');
    });

    it('should pass execution options to provider', async () => {
      const mockResult = createMockCodeSearchResult();
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: CodeSearchQuery = {
        keywords: ['test'],
        projectId: 'owner/repo',
      };

      const authInfo: AuthInfo = {
        token: 'oauth-token',
        clientId: 'test-client',
        scopes: ['repo'],
      };

      const options = {
        authInfo,
        sessionId: 'session-123',
        token: 'custom-token',
        baseUrl: 'https://github.enterprise.com',
      };

      await executeCodeSearch(query, options);

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: 'custom-token',
        authInfo,
        baseUrl: 'https://github.enterprise.com',
      });
    });

    it('should handle code search with all query parameters', async () => {
      const mockResult = createMockCodeSearchResult();
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: CodeSearchQuery = {
        keywords: ['function', 'async'],
        projectId: 'owner/repo',
        path: 'src/',
        filename: 'index.ts',
        extension: 'ts',
        ref: 'develop',
        limit: 50,
        page: 2,
        mainResearchGoal: 'Find async functions',
        researchGoal: 'Analyze async patterns',
        reasoning: 'Need to understand async usage',
      };

      await executeCodeSearch(query);

      expect(mockProvider.searchCode).toHaveBeenCalledWith(query);
    });

    it('should handle code search error response', async () => {
      const errorResult: ProviderResponse<CodeSearchResult> = {
        error: 'Rate limit exceeded',
        status: 429,
        provider: 'github',
        rateLimit: {
          remaining: 0,
          reset: Date.now() + 3600000,
          retryAfter: 3600,
        },
      };
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        errorResult
      );

      const query: CodeSearchQuery = {
        keywords: ['test'],
        projectId: 'owner/repo',
      };

      const result = await executeCodeSearch(query);

      expect(result.error).toBe('Rate limit exceeded');
      expect(result.status).toBe(429);
    });

    it('should handle code search without projectId', async () => {
      const mockResult = createMockCodeSearchResult();
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: CodeSearchQuery = {
        keywords: ['useState'],
      };

      await executeCodeSearch(query);

      expect(mockProvider.searchCode).toHaveBeenCalledWith(query);
    });
  });

  // ============================================================================
  // executeGetFileContent Tests
  // ============================================================================

  describe('executeGetFileContent', () => {
    it('should fetch file content with default provider', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'facebook/react',
        path: 'packages/react/src/React.js',
        ref: 'main',
      };

      const result = await executeGetFileContent(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(mockProvider.getFileContent).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should fetch file content with gitlab provider', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');

      const mockResult = {
        ...createMockFileContentResult(),
        provider: 'gitlab' as ProviderType,
      };
      (
        gitlabProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        provider: 'gitlab',
        projectId: '12345',
        path: 'src/main.py',
        ref: 'master',
      };

      const result = await executeGetFileContent(query);

      expect(mockGetProvider).toHaveBeenCalledWith(
        'gitlab',
        expect.any(Object)
      );
      expect(result.provider).toBe('gitlab');
    });

    it('should pass execution options to provider', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'src/index.ts',
      };

      const options = {
        token: 'token-123',
        baseUrl: 'https://custom.github.com',
      };

      await executeGetFileContent(query, options);

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: 'token-123',
        authInfo: undefined,
        baseUrl: 'https://custom.github.com',
      });
    });

    it('should handle file content with line range', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'src/utils.ts',
        startLine: 10,
        endLine: 50,
      };

      await executeGetFileContent(query);

      expect(mockProvider.getFileContent).toHaveBeenCalledWith(query);
    });

    it('should handle file content with match string', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'src/component.tsx',
        matchString: 'function handleClick',
        matchStringContextLines: 5,
      };

      await executeGetFileContent(query);

      expect(mockProvider.getFileContent).toHaveBeenCalledWith(query);
    });

    it('should handle file content with byte range', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'large-file.json',
        charOffset: 1000,
        charLength: 5000,
      };

      await executeGetFileContent(query);

      expect(mockProvider.getFileContent).toHaveBeenCalledWith(query);
    });

    it('should handle file content error response', async () => {
      const errorResult: ProviderResponse<FileContentResult> = {
        error: 'File not found',
        status: 404,
        provider: 'github',
      };
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(errorResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'nonexistent.ts',
      };

      const result = await executeGetFileContent(query);

      expect(result.error).toBe('File not found');
      expect(result.status).toBe(404);
    });

    it('should handle file content with fullContent flag', async () => {
      const mockResult = createMockFileContentResult();
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: FileContentQuery = {
        projectId: 'owner/repo',
        path: 'src/index.ts',
        fullContent: true,
      };

      await executeGetFileContent(query);

      expect(mockProvider.getFileContent).toHaveBeenCalledWith(query);
    });
  });

  // ============================================================================
  // executeRepoSearch Tests
  // ============================================================================

  describe('executeRepoSearch', () => {
    it('should execute repository search with default provider', async () => {
      const mockResult = createMockRepoSearchResult();
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: RepoSearchQuery = {
        keywords: ['react', 'hooks'],
        topics: ['typescript'],
        minStars: 100,
      };

      const result = await executeRepoSearch(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(mockProvider.searchRepos).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should execute repository search with gitlab provider', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');

      const mockResult = {
        ...createMockRepoSearchResult(),
        provider: 'gitlab' as ProviderType,
      };
      (
        gitlabProvider.searchRepos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoSearchQuery = {
        provider: 'gitlab',
        keywords: ['ci', 'cd'],
        visibility: 'public',
      };

      const result = await executeRepoSearch(query);

      expect(mockGetProvider).toHaveBeenCalledWith(
        'gitlab',
        expect.any(Object)
      );
      expect(result.provider).toBe('gitlab');
    });

    it('should pass execution options to provider', async () => {
      const mockResult = createMockRepoSearchResult();
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: RepoSearchQuery = {
        keywords: ['test'],
      };

      const authInfo: AuthInfo = {
        token: 'auth-token',
        clientId: 'client-id',
        scopes: [],
      };

      await executeRepoSearch(query, { authInfo, token: 'override-token' });

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: 'override-token',
        authInfo,
        baseUrl: undefined,
      });
    });

    it('should handle repository search with all parameters', async () => {
      const mockResult = createMockRepoSearchResult();
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: RepoSearchQuery = {
        keywords: ['testing', 'framework'],
        topics: ['javascript', 'nodejs'],
        owner: 'testing-org',
        minStars: 500,
        visibility: 'public',
        sort: 'stars',
        order: 'desc',
        limit: 25,
        page: 1,
      };

      await executeRepoSearch(query);

      expect(mockProvider.searchRepos).toHaveBeenCalledWith(query);
    });

    it('should handle repository search error response', async () => {
      const errorResult: ProviderResponse<RepoSearchResult> = {
        error: 'Invalid query syntax',
        status: 400,
        provider: 'github',
      };
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        errorResult
      );

      const query: RepoSearchQuery = {
        keywords: ['test'],
      };

      const result = await executeRepoSearch(query);

      expect(result.error).toBe('Invalid query syntax');
      expect(result.status).toBe(400);
    });

    it('should handle repository search with empty query', async () => {
      const mockResult = createMockRepoSearchResult();
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      const query: RepoSearchQuery = {};

      await executeRepoSearch(query);

      expect(mockProvider.searchRepos).toHaveBeenCalledWith(query);
    });
  });

  // ============================================================================
  // executePullRequestSearch Tests
  // ============================================================================

  describe('executePullRequestSearch', () => {
    it('should execute pull request search with default provider', async () => {
      const mockResult = createMockPullRequestSearchResult();
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        projectId: 'facebook/react',
        number: 12345,
        withComments: true,
      };

      const result = await executePullRequestSearch(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(mockProvider.searchPullRequests).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should execute pull request search with gitlab provider', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');

      const mockResult = {
        ...createMockPullRequestSearchResult(),
        provider: 'gitlab' as ProviderType,
      };
      (
        gitlabProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        provider: 'gitlab',
        projectId: 'gitlab-org/gitlab',
        state: 'open',
      };

      const result = await executePullRequestSearch(query);

      expect(mockGetProvider).toHaveBeenCalledWith(
        'gitlab',
        expect.any(Object)
      );
      expect(result.provider).toBe('gitlab');
    });

    it('should pass execution options to provider', async () => {
      const mockResult = createMockPullRequestSearchResult();
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        projectId: 'owner/repo',
        state: 'open',
      };

      await executePullRequestSearch(query, {
        sessionId: 'session-456',
        baseUrl: 'https://enterprise.github.com',
      });

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: 'https://enterprise.github.com',
      });
    });

    it('should handle pull request search with all parameters', async () => {
      const mockResult = createMockPullRequestSearchResult();
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        projectId: 'owner/repo',
        state: 'open',
        author: 'developer',
        assignee: 'reviewer',
        labels: ['bug', 'high-priority'],
        baseBranch: 'main',
        headBranch: 'feature-branch',
        created: '>2024-01-01',
        updated: '>2024-06-01',
        withComments: true,
        withCommits: true,
        type: 'fullContent',
        sort: 'updated',
        order: 'desc',
        limit: 20,
        page: 1,
      };

      await executePullRequestSearch(query);

      expect(mockProvider.searchPullRequests).toHaveBeenCalledWith(query);
    });

    it('should handle pull request search by PR number', async () => {
      const mockResult = createMockPullRequestSearchResult();
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        projectId: 'owner/repo',
        number: 42,
        withComments: true,
        withCommits: true,
      };

      await executePullRequestSearch(query);

      expect(mockProvider.searchPullRequests).toHaveBeenCalledWith(query);
    });

    it('should handle pull request search error response', async () => {
      const errorResult: ProviderResponse<PullRequestSearchResult> = {
        error: 'Repository not found',
        status: 404,
        provider: 'github',
      };
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(errorResult);

      const query: PullRequestQuery = {
        projectId: 'nonexistent/repo',
        state: 'open',
      };

      const result = await executePullRequestSearch(query);

      expect(result.error).toBe('Repository not found');
      expect(result.status).toBe(404);
    });

    it('should handle cross-repo PR search without projectId', async () => {
      const mockResult = createMockPullRequestSearchResult();
      (
        mockProvider.searchPullRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: PullRequestQuery = {
        author: 'developer',
        state: 'open',
      };

      await executePullRequestSearch(query);

      expect(mockProvider.searchPullRequests).toHaveBeenCalledWith(query);
    });
  });

  // ============================================================================
  // executeGetRepoStructure Tests
  // ============================================================================

  describe('executeGetRepoStructure', () => {
    it('should fetch repository structure with default provider', async () => {
      const mockResult = createMockRepoStructureResult();
      (
        mockProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoStructureQuery = {
        projectId: 'facebook/react',
        ref: 'main',
        path: 'packages',
        depth: 2,
      };

      const result = await executeGetRepoStructure(query);

      expect(mockExtractProviderFromQuery).toHaveBeenCalledWith(query);
      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo: undefined,
        baseUrl: undefined,
      });
      expect(mockProvider.getRepoStructure).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('should fetch repository structure with gitlab provider', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');

      const mockResult = {
        ...createMockRepoStructureResult(),
        provider: 'gitlab' as ProviderType,
      };
      (
        gitlabProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoStructureQuery = {
        provider: 'gitlab',
        projectId: '12345',
        ref: 'master',
      };

      const result = await executeGetRepoStructure(query);

      expect(mockGetProvider).toHaveBeenCalledWith(
        'gitlab',
        expect.any(Object)
      );
      expect(result.provider).toBe('gitlab');
    });

    it('should pass execution options to provider', async () => {
      const mockResult = createMockRepoStructureResult();
      (
        mockProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoStructureQuery = {
        projectId: 'owner/repo',
      };

      const authInfo: AuthInfo = {
        token: 'struct-token',
        clientId: 'client',
        scopes: [],
      };

      await executeGetRepoStructure(query, { authInfo });

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: undefined,
        authInfo,
        baseUrl: undefined,
      });
    });

    it('should handle repository structure with all parameters', async () => {
      const mockResult = createMockRepoStructureResult();
      (
        mockProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoStructureQuery = {
        projectId: 'owner/repo',
        ref: 'develop',
        path: 'src/components',
        depth: 3,
        recursive: true,
        entriesPerPage: 100,
        entryPageNumber: 2,
      };

      await executeGetRepoStructure(query);

      expect(mockProvider.getRepoStructure).toHaveBeenCalledWith(query);
    });

    it('should handle repository structure error response', async () => {
      const errorResult: ProviderResponse<RepoStructureResult> = {
        error: 'Branch not found',
        status: 404,
        provider: 'github',
      };
      (
        mockProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(errorResult);

      const query: RepoStructureQuery = {
        projectId: 'owner/repo',
        ref: 'nonexistent-branch',
      };

      const result = await executeGetRepoStructure(query);

      expect(result.error).toBe('Branch not found');
      expect(result.status).toBe(404);
    });

    it('should handle repository structure with minimal query', async () => {
      const mockResult = createMockRepoStructureResult();
      (
        mockProvider.getRepoStructure as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const query: RepoStructureQuery = {
        projectId: 'owner/repo',
      };

      await executeGetRepoStructure(query);

      expect(mockProvider.getRepoStructure).toHaveBeenCalledWith(query);
    });
  });

  // ============================================================================
  // createExecutionOptions Tests
  // ============================================================================

  describe('createExecutionOptions', () => {
    it('should create execution options with all parameters', () => {
      const authInfo: AuthInfo = {
        token: 'auth-token',
        clientId: 'client-id',
        scopes: ['repo', 'read:user'],
      };

      const options = createExecutionOptions(
        authInfo,
        'session-123',
        'custom-token',
        'https://enterprise.github.com'
      );

      expect(options).toEqual({
        authInfo,
        sessionId: 'session-123',
        token: 'custom-token',
        baseUrl: 'https://enterprise.github.com',
      });
    });

    it('should create execution options with only authInfo', () => {
      const authInfo: AuthInfo = {
        token: 'token',
        clientId: 'client',
        scopes: [],
      };

      const options = createExecutionOptions(authInfo);

      expect(options).toEqual({
        authInfo,
        sessionId: undefined,
        token: undefined,
        baseUrl: undefined,
      });
    });

    it('should create execution options with only sessionId', () => {
      const options = createExecutionOptions(undefined, 'session-456');

      expect(options).toEqual({
        authInfo: undefined,
        sessionId: 'session-456',
        token: undefined,
        baseUrl: undefined,
      });
    });

    it('should create execution options with only token', () => {
      const options = createExecutionOptions(undefined, undefined, 'my-token');

      expect(options).toEqual({
        authInfo: undefined,
        sessionId: undefined,
        token: 'my-token',
        baseUrl: undefined,
      });
    });

    it('should create execution options with only baseUrl', () => {
      const options = createExecutionOptions(
        undefined,
        undefined,
        undefined,
        'https://custom.api.com'
      );

      expect(options).toEqual({
        authInfo: undefined,
        sessionId: undefined,
        token: undefined,
        baseUrl: 'https://custom.api.com',
      });
    });

    it('should create empty execution options', () => {
      const options = createExecutionOptions();

      expect(options).toEqual({
        authInfo: undefined,
        sessionId: undefined,
        token: undefined,
        baseUrl: undefined,
      });
    });

    it('should handle partial parameters', () => {
      const authInfo: AuthInfo = {
        token: 'token',
        clientId: 'client',
        scopes: [],
      };

      const options = createExecutionOptions(
        authInfo,
        undefined,
        'token-override'
      );

      expect(options).toEqual({
        authInfo,
        sessionId: undefined,
        token: 'token-override',
        baseUrl: undefined,
      });
    });
  });

  // ============================================================================
  // isValidProvider Tests
  // ============================================================================

  describe('isValidProvider', () => {
    it('should return true for "github"', () => {
      expect(isValidProvider('github')).toBe(true);
    });

    it('should return true for "gitlab"', () => {
      expect(isValidProvider('gitlab')).toBe(true);
    });

    it('should return false for invalid provider string', () => {
      expect(isValidProvider('bitbucket')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidProvider('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidProvider(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidProvider(undefined)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isValidProvider(123)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isValidProvider({ type: 'github' })).toBe(false);
    });

    it('should return false for array', () => {
      expect(isValidProvider(['github'])).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(isValidProvider(true)).toBe(false);
    });

    it('should return false for similar but incorrect strings', () => {
      expect(isValidProvider('GitHub')).toBe(false);
      expect(isValidProvider('GITHUB')).toBe(false);
      expect(isValidProvider('GitLab')).toBe(false);
      expect(isValidProvider('GITLAB')).toBe(false);
      expect(isValidProvider(' github')).toBe(false);
      expect(isValidProvider('github ')).toBe(false);
    });

    it('should act as type guard', () => {
      const value: unknown = 'github';
      if (isValidProvider(value)) {
        // TypeScript should recognize value as ProviderType here
        const provider: ProviderType = value;
        expect(provider).toBe('github');
      }
    });
  });

  // ============================================================================
  // getDefaultProvider Tests
  // ============================================================================

  describe('getDefaultProvider', () => {
    it('should return "github" as default provider', () => {
      expect(getDefaultProvider()).toBe('github');
    });

    it('should return the same value as DEFAULT_PROVIDER constant', () => {
      expect(getDefaultProvider()).toBe(DEFAULT_PROVIDER);
    });

    it('should return a valid provider type', () => {
      const defaultProvider = getDefaultProvider();
      expect(isValidProvider(defaultProvider)).toBe(true);
    });
  });

  // ============================================================================
  // legacyToUnified Tests
  // ============================================================================

  describe('legacyToUnified', () => {
    it('should convert owner and repo to projectId', () => {
      const result = legacyToUnified({ owner: 'facebook', repo: 'react' });
      expect(result).toEqual({ projectId: 'facebook/react' });
    });

    it('should return only owner as projectId when repo is missing', () => {
      const result = legacyToUnified({ owner: 'facebook' });
      expect(result).toEqual({ projectId: 'facebook' });
    });

    it('should return empty object when both owner and repo are missing', () => {
      const result = legacyToUnified({});
      expect(result).toEqual({});
    });

    it('should return empty object when only repo is provided', () => {
      const result = legacyToUnified({ repo: 'react' });
      expect(result).toEqual({});
    });

    it('should handle empty string owner', () => {
      const result = legacyToUnified({ owner: '', repo: 'react' });
      expect(result).toEqual({});
    });

    it('should handle empty string repo with valid owner', () => {
      const result = legacyToUnified({ owner: 'facebook', repo: '' });
      expect(result).toEqual({ projectId: 'facebook' });
    });

    it('should handle special characters in owner and repo', () => {
      const result = legacyToUnified({ owner: 'my-org', repo: 'my-repo.js' });
      expect(result).toEqual({ projectId: 'my-org/my-repo.js' });
    });

    it('should handle numeric-like owner', () => {
      const result = legacyToUnified({ owner: '12345', repo: 'project' });
      expect(result).toEqual({ projectId: '12345/project' });
    });

    it('should be usable with spread operator', () => {
      const oldQuery = { owner: 'facebook', repo: 'react' };
      const unifiedQuery = {
        ...legacyToUnified(oldQuery),
        keywords: ['useState'],
      };
      expect(unifiedQuery).toEqual({
        projectId: 'facebook/react',
        keywords: ['useState'],
      });
    });

    it('should handle undefined values explicitly', () => {
      const result = legacyToUnified({ owner: undefined, repo: undefined });
      expect(result).toEqual({});
    });
  });

  // ============================================================================
  // unifiedToLegacy Tests
  // ============================================================================

  describe('unifiedToLegacy', () => {
    it('should convert projectId with owner/repo format to legacy', () => {
      const result = unifiedToLegacy('facebook/react');
      expect(result).toEqual({ owner: 'facebook', repo: 'react' });
    });

    it('should return only owner for single-part projectId', () => {
      const result = unifiedToLegacy('facebook');
      expect(result).toEqual({ owner: 'facebook' });
    });

    it('should return empty object for undefined projectId', () => {
      const result = unifiedToLegacy(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object for empty string projectId', () => {
      const result = unifiedToLegacy('');
      expect(result).toEqual({});
    });

    it('should handle projectId with multiple slashes', () => {
      // Only first two parts should be used
      const result = unifiedToLegacy('org/repo/extra/parts');
      // Based on implementation, it splits and checks for length === 2
      expect(result).toEqual({ owner: 'org/repo/extra/parts' });
    });

    it('should handle projectId with trailing slash', () => {
      const result = unifiedToLegacy('owner/');
      expect(result).toEqual({ owner: 'owner', repo: '' });
    });

    it('should handle projectId with leading slash', () => {
      const result = unifiedToLegacy('/repo');
      expect(result).toEqual({ owner: '', repo: 'repo' });
    });

    it('should handle special characters in projectId', () => {
      const result = unifiedToLegacy('my-org/my-repo.js');
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo.js' });
    });

    it('should handle numeric projectId', () => {
      const result = unifiedToLegacy('12345');
      expect(result).toEqual({ owner: '12345' });
    });

    it('should be inverse of legacyToUnified for standard owner/repo', () => {
      const legacy = { owner: 'facebook', repo: 'react' };
      const unified = legacyToUnified(legacy);
      const backToLegacy = unifiedToLegacy(unified.projectId);
      expect(backToLegacy).toEqual(legacy);
    });

    it('should handle single-part round trip', () => {
      const legacy = { owner: 'organization' };
      const unified = legacyToUnified(legacy);
      const backToLegacy = unifiedToLegacy(unified.projectId);
      expect(backToLegacy).toEqual({ owner: 'organization' });
    });
  });

  // ============================================================================
  // Integration-like Tests
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('should handle switching between providers for the same operation', async () => {
      const githubProvider = createMockProvider('github');
      const gitlabProvider = createMockProvider('gitlab');

      // First call with GitHub
      mockGetProvider.mockReturnValue(githubProvider);
      mockExtractProviderFromQuery.mockReturnValue('github');
      const githubResult = createMockCodeSearchResult();
      (githubProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        githubResult
      );

      const query1: CodeSearchQuery = {
        keywords: ['test'],
        projectId: 'owner/repo',
      };
      await executeCodeSearch(query1);
      expect(mockGetProvider).toHaveBeenCalledWith(
        'github',
        expect.any(Object)
      );

      // Second call with GitLab
      mockGetProvider.mockReturnValue(gitlabProvider);
      mockExtractProviderFromQuery.mockReturnValue('gitlab');
      const gitlabResult = {
        ...createMockCodeSearchResult(),
        provider: 'gitlab' as ProviderType,
      };
      (gitlabProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        gitlabResult
      );

      const query2: CodeSearchQuery = {
        provider: 'gitlab',
        keywords: ['test'],
        projectId: '12345',
      };
      await executeCodeSearch(query2);
      expect(mockGetProvider).toHaveBeenLastCalledWith(
        'gitlab',
        expect.any(Object)
      );
    });

    it('should handle different operations with same provider', async () => {
      const codeResult = createMockCodeSearchResult();
      const fileResult = createMockFileContentResult();
      const repoResult = createMockRepoSearchResult();

      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        codeResult
      );
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(fileResult);
      (mockProvider.searchRepos as ReturnType<typeof vi.fn>).mockResolvedValue(
        repoResult
      );

      // Execute different operations
      await executeCodeSearch({ keywords: ['test'], projectId: 'owner/repo' });
      await executeGetFileContent({ projectId: 'owner/repo', path: 'file.ts' });
      await executeRepoSearch({ keywords: ['test'] });

      expect(mockProvider.searchCode).toHaveBeenCalledTimes(1);
      expect(mockProvider.getFileContent).toHaveBeenCalledTimes(1);
      expect(mockProvider.searchRepos).toHaveBeenCalledTimes(1);
    });

    it('should pass consistent options across different operations', async () => {
      const authInfo: AuthInfo = {
        token: 'consistent-token',
        clientId: 'client',
        scopes: [],
      };
      const options = createExecutionOptions(
        authInfo,
        'session',
        'token',
        'https://base.url'
      );

      const codeResult = createMockCodeSearchResult();
      const fileResult = createMockFileContentResult();

      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        codeResult
      );
      (
        mockProvider.getFileContent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(fileResult);

      await executeCodeSearch(
        { keywords: ['test'], projectId: 'owner/repo' },
        options
      );
      await executeGetFileContent(
        { projectId: 'owner/repo', path: 'file.ts' },
        options
      );

      expect(mockGetProvider).toHaveBeenCalledWith('github', {
        type: 'github',
        token: 'token',
        authInfo,
        baseUrl: 'https://base.url',
      });
    });

    it('should use legacy to unified conversion in real scenario', async () => {
      const mockResult = createMockCodeSearchResult();
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResult
      );

      // Simulate migrating from legacy format
      const legacyParams = { owner: 'facebook', repo: 'react' };
      const unifiedQuery: CodeSearchQuery = {
        ...legacyToUnified(legacyParams),
        keywords: ['useState', 'useEffect'],
      };

      await executeCodeSearch(unifiedQuery);

      expect(mockProvider.searchCode).toHaveBeenCalledWith({
        projectId: 'facebook/react',
        keywords: ['useState', 'useEffect'],
      });
    });

    it('should handle rate limit response gracefully', async () => {
      const rateLimitResult: ProviderResponse<CodeSearchResult> = {
        error: 'API rate limit exceeded',
        status: 403,
        provider: 'github',
        rateLimit: {
          remaining: 0,
          reset: Math.floor(Date.now() / 1000) + 3600,
          retryAfter: 3600,
        },
        hints: ['Wait for rate limit reset or use a different token'],
      };
      (mockProvider.searchCode as ReturnType<typeof vi.fn>).mockResolvedValue(
        rateLimitResult
      );

      const result = await executeCodeSearch({ keywords: ['test'] });

      expect(result.error).toBe('API rate limit exceeded');
      expect(result.rateLimit?.remaining).toBe(0);
      expect(result.hints).toContain(
        'Wait for rate limit reset or use a different token'
      );
    });
  });
});
