/**
 * GitHub Provider Adapter
 *
 * Implements the ICodeHostProvider interface by wrapping existing GitHub API functions.
 * This adapter transforms unified query/result types to/from GitHub-specific formats.
 *
 * @module providers/github/GitHubProvider
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  ICodeHostProvider,
  ProviderConfig,
  ProviderResponse,
  CodeSearchQuery,
  CodeSearchResult,
  CodeSearchItem,
  FileContentQuery,
  FileContentResult,
  RepoSearchQuery,
  RepoSearchResult,
  UnifiedRepository,
  PullRequestQuery,
  PullRequestSearchResult,
  PullRequestItem,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';

// Import existing GitHub API functions
import { searchGitHubCodeAPI } from '../../github/codeSearch.js';
import { fetchGitHubFileContentAPI } from '../../github/fileContent.js';
import { searchGitHubReposAPI } from '../../github/repoSearch.js';
import { searchGitHubPullRequestsAPI } from '../../github/pullRequestSearch.js';
import { viewGitHubRepositoryStructureAPI } from '../../github/repoStructure.js';

// Import GitHub-specific types
import type {
  GitHubCodeSearchQuery,
  GitHubReposSearchQuery,
  GitHubViewRepoStructureQuery,
  FileContentQuery as GHFileContentQuery,
} from '../../types.js';
import type {
  GitHubPullRequestsSearchParams,
  OptimizedCodeSearchResult,
  GitHubAPIError,
} from '../../github/githubAPI.js';
import { handleGitHubAPIError } from '../../github/errors.js';

// Internal interfaces for type safety
interface GitHubFileContentData {
  path?: string;
  content?: string;
  contentLength?: number;
  branch?: string;
  lastModified?: string;
  lastModifiedBy?: string;
  pagination?: {
    startLine?: number;
    endLine?: number;
    totalLines?: number;
  };
  isPartial?: boolean;
  startLine?: number;
  endLine?: number;
}

interface GitHubRepoData {
  owner: string;
  repo: string;
  description?: string | null;
  url: string;
  defaultBranch?: string;
  stars?: number;
  forksCount?: number;
  visibility?: string;
  topics?: string[];
  createdAt?: string;
  updatedAt?: string;
  pushedAt?: string;
  openIssuesCount?: number;
}

interface GitHubRepoSearchData {
  repositories: GitHubRepoData[];
  pagination?: {
    currentPage?: number;
    totalPages?: number;
    hasMore?: boolean;
    totalMatches?: number;
  };
}

interface GitHubPRData {
  number: number;
  title: string;
  body?: string | null;
  html_url?: string;
  url?: string;
  merged?: boolean;
  state: string;
  draft?: boolean;
  author?: string;
  assignees?: Array<{ login?: string } | string>;
  labels?: Array<{ name?: string } | string>;
  head_ref?: string;
  head?: string;
  base_ref?: string;
  base?: string;
  head_sha?: string;
  base_sha?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  merged_at?: string;
  comments?: number;
  changed_files?: number;
  additions?: number;
  deletions?: number;
  comment_details?: Array<{
    id: string | number;
    user?: string;
    body?: string;
    created_at?: string;
    updated_at?: string;
  }>;
  file_changes?: {
    files?: Array<{
      filename: string;
      status?: string;
      additions?: number;
      deletions?: number;
      patch?: string;
    }>;
  };
}

interface GitHubPRSearchData {
  pull_requests?: GitHubPRData[];
  total_count?: number;
  pagination?: {
    currentPage?: number;
    totalPages?: number;
    hasMore?: boolean;
    totalMatches?: number;
  };
}

interface GitHubRepoStructureData {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  structure?: Record<string, { files: string[]; folders: string[] }>;
  summary?: {
    totalFiles?: number;
    totalFolders?: number;
    truncated?: boolean;
  };
  pagination?: {
    currentPage?: number;
    totalPages?: number;
    hasMore?: boolean;
  };
  hints?: string[];
}

/**
 * GitHub Provider implementation.
 *
 * Wraps existing GitHub API functions to conform to the unified ICodeHostProvider interface.
 */
export class GitHubProvider implements ICodeHostProvider {
  readonly type = 'github' as const;
  private authInfo?: AuthInfo;

  constructor(config?: ProviderConfig) {
    this.authInfo = config?.authInfo;
    if (config?.token) {
      this.authInfo = { token: config.token } as AuthInfo;
    }
  }

  // ============================================================================
  // CODE SEARCH
  // ============================================================================

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
      // Transform unified query to GitHub format
      const { owner, repo } = this.parseProjectId(query.projectId);

      const githubQuery: GitHubCodeSearchQuery = {
        keywordsToSearch: query.keywords,
        owner,
        repo,
        extension: query.extension,
        filename: query.filename,
        path: query.path,
        limit: query.limit,
        page: query.page,
        mainResearchGoal: query.mainResearchGoal,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };

      const result = await searchGitHubCodeAPI(githubQuery, this.authInfo);

      // Check for error
      if ('error' in result) {
        const errorResult = result as {
          error: string | { toString(): string };
          status?: number;
          hints?: string[];
        };
        return {
          error:
            typeof errorResult.error === 'string'
              ? errorResult.error
              : String(errorResult.error),
          status: errorResult.status || 500,
          provider: 'github',
          hints: errorResult.hints,
        };
      }

      // Transform result
      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitHub API',
          status: 500,
          provider: 'github',
        };
      }

      return {
        data: this.transformCodeSearchResult(result.data),
        status: 200,
        provider: 'github',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformCodeSearchResult(
    data: OptimizedCodeSearchResult
  ): CodeSearchResult {
    const items: CodeSearchItem[] = data.items.map(item => ({
      path: item.path,
      matches: item.matches.map(m => ({
        context: m.context,
        positions: m.positions,
      })),
      url: item.url || '',
      repository: {
        id: item.repository.nameWithOwner,
        name: item.repository.nameWithOwner,
        url: item.repository.url,
      },
      lastModifiedAt: item.lastModifiedAt,
    }));

    return {
      items,
      totalCount: data.total_count,
      pagination: {
        currentPage: data.pagination?.currentPage || 1,
        totalPages: data.pagination?.totalPages || 1,
        hasMore: data.pagination?.hasMore || false,
        totalMatches: data.pagination?.totalMatches,
      },
      repositoryContext: data._researchContext?.repositoryContext,
    };
  }

  // ============================================================================
  // FILE CONTENT
  // ============================================================================

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      const { owner, repo } = this.parseProjectId(query.projectId);

      if (!owner || !repo) {
        return {
          error: 'Project ID is required for file content',
          status: 400,
          provider: 'github',
        };
      }

      const githubQuery: GHFileContentQuery = {
        owner,
        repo,
        path: query.path,
        branch: query.ref,
        startLine: query.startLine,
        endLine: query.endLine,
        matchString: query.matchString,
        matchStringContextLines: query.matchStringContextLines,
        charOffset: query.charOffset,
        charLength: query.charLength,
        fullContent: query.fullContent,
        mainResearchGoal: query.mainResearchGoal,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };

      const result = await fetchGitHubFileContentAPI(
        githubQuery,
        this.authInfo
      );

      if ('error' in result) {
        const errorResult = result as {
          error: string | { toString(): string };
          status?: number;
          hints?: string[];
        };
        return {
          error:
            typeof errorResult.error === 'string'
              ? errorResult.error
              : String(errorResult.error),
          status: errorResult.status || 500,
          provider: 'github',
          hints: errorResult.hints,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitHub API',
          status: 500,
          provider: 'github',
        };
      }

      return {
        data: this.transformFileContentResult(result.data, query),
        status: 200,
        provider: 'github',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformFileContentResult(
    data: GitHubFileContentData,
    query: FileContentQuery
  ): FileContentResult {
    return {
      path: data.path || query.path,
      content: data.content || '',
      encoding: 'utf-8',
      size: data.contentLength || 0,
      ref: data.branch || query.ref || '',
      lastModified: data.lastModified,
      lastModifiedBy: data.lastModifiedBy,
      pagination: data.pagination,
      isPartial: data.isPartial,
      startLine: data.startLine,
      endLine: data.endLine,
    };
  }

  // ============================================================================
  // REPO SEARCH
  // ============================================================================

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    try {
      const githubQuery: GitHubReposSearchQuery = {
        keywordsToSearch: query.keywords,
        topicsToSearch: query.topics,
        owner: query.owner,
        stars: query.minStars ? `>=${query.minStars}` : undefined,
        sort:
          query.sort === 'best-match'
            ? undefined
            : (query.sort as 'stars' | 'forks' | 'updated' | undefined),
        limit: query.limit,
        page: query.page,
        mainResearchGoal: query.mainResearchGoal,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };

      const result = await searchGitHubReposAPI(githubQuery, this.authInfo);

      if ('error' in result) {
        const errorResult = result as {
          error: string | { toString(): string };
          status?: number;
          hints?: string[];
        };
        return {
          error:
            typeof errorResult.error === 'string'
              ? errorResult.error
              : String(errorResult.error),
          status: errorResult.status || 500,
          provider: 'github',
          hints: errorResult.hints,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitHub API',
          status: 500,
          provider: 'github',
        };
      }

      return {
        data: this.transformRepoSearchResult(result.data),
        status: 200,
        provider: 'github',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformRepoSearchResult(
    data: GitHubRepoSearchData
  ): RepoSearchResult {
    const repositories: UnifiedRepository[] = data.repositories.map(
      (repo: GitHubRepoData) => ({
        id: `${repo.owner}/${repo.repo}`,
        name: repo.repo,
        fullPath: `${repo.owner}/${repo.repo}`,
        description: repo.description || null,
        url: repo.url,
        cloneUrl: `https://github.com/${repo.owner}/${repo.repo}.git`,
        defaultBranch: repo.defaultBranch || 'main',
        stars: repo.stars || 0,
        forks: repo.forksCount || 0,
        visibility: repo.visibility || 'public',
        topics: repo.topics || [],
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
        lastActivityAt: repo.pushedAt || repo.updatedAt,
        openIssuesCount: repo.openIssuesCount,
      })
    );

    return {
      repositories,
      totalCount: data.pagination?.totalMatches || repositories.length,
      pagination: {
        currentPage: data.pagination?.currentPage || 1,
        totalPages: data.pagination?.totalPages || 1,
        hasMore: data.pagination?.hasMore || false,
        totalMatches: data.pagination?.totalMatches,
      },
    };
  }

  // ============================================================================
  // PULL REQUEST SEARCH
  // ============================================================================

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      const { owner, repo } = query.projectId
        ? this.parseProjectId(query.projectId)
        : { owner: undefined, repo: undefined };

      const githubParams: GitHubPullRequestsSearchParams = {
        owner,
        repo,
        prNumber: query.number,
        state:
          query.state === 'merged'
            ? 'closed'
            : query.state === 'all'
              ? undefined
              : query.state,
        merged: query.state === 'merged' ? true : undefined,
        author: query.author,
        assignee: query.assignee,
        label: query.labels,
        base: query.baseBranch,
        head: query.headBranch,
        created: query.created,
        updated: query.updated,
        withComments: query.withComments,
        withCommits: query.withCommits,
        type: query.type,
        sort: query.sort,
        order: query.order,
        limit: query.limit,
        page: query.page,
      };

      const result = await searchGitHubPullRequestsAPI(
        githubParams,
        this.authInfo
      );

      if (result.error) {
        return {
          error:
            typeof result.error === 'string'
              ? result.error
              : String(result.error),
          status: 500,
          provider: 'github',
          hints: result.hints,
        };
      }

      return {
        data: this.transformPullRequestResult(result, query),
        status: 200,
        provider: 'github',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformPullRequestResult(
    data: GitHubPRSearchData,
    query: PullRequestQuery
  ): PullRequestSearchResult {
    const items: PullRequestItem[] = (data.pull_requests || []).map(
      (pr: GitHubPRData) => ({
        number: pr.number,
        title: pr.title,
        body: pr.body || null,
        url: pr.html_url || pr.url,
        state: pr.merged ? 'merged' : pr.state,
        draft: pr.draft || false,
        author: pr.author,
        assignees:
          pr.assignees?.map(a =>
            typeof a === 'string' ? a : (a.login ?? '')
          ) || [],
        labels:
          pr.labels?.map(l => (typeof l === 'string' ? l : (l.name ?? ''))) ||
          [],
        sourceBranch: pr.head_ref || pr.head || '',
        targetBranch: pr.base_ref || pr.base || '',
        sourceSha: pr.head_sha,
        targetSha: pr.base_sha,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        mergedAt: pr.merged_at,
        commentsCount: pr.comments,
        changedFilesCount: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        comments: pr.comment_details?.map(c => ({
          id: c.id,
          author: c.user,
          body: c.body,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        fileChanges: pr.file_changes?.files?.map(f => ({
          path: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      })
    );

    const { owner, repo } = query.projectId
      ? this.parseProjectId(query.projectId)
      : { owner: undefined, repo: undefined };

    return {
      items,
      totalCount: data.total_count || items.length,
      pagination: {
        currentPage: data.pagination?.currentPage || 1,
        totalPages: data.pagination?.totalPages || 1,
        hasMore: data.pagination?.hasMore || false,
        totalMatches: data.pagination?.totalMatches,
      },
      repositoryContext: owner && repo ? { owner, repo } : undefined,
    };
  }

  // ============================================================================
  // REPO STRUCTURE
  // ============================================================================

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      const { owner, repo } = this.parseProjectId(query.projectId);

      if (!owner || !repo) {
        return {
          error: 'Project ID is required for repository structure',
          status: 400,
          provider: 'github',
        };
      }

      const githubQuery: GitHubViewRepoStructureQuery = {
        owner,
        repo,
        branch: query.ref || 'HEAD',
        path: query.path,
        depth: query.depth,
        entriesPerPage: query.entriesPerPage,
        entryPageNumber: query.entryPageNumber,
        mainResearchGoal: query.mainResearchGoal,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };

      const result = await viewGitHubRepositoryStructureAPI(
        githubQuery,
        this.authInfo
      );

      if ('error' in result) {
        const errorResult = result as {
          error: string | { toString(): string };
          status?: number;
          hints?: string[];
        };
        return {
          error:
            typeof errorResult.error === 'string'
              ? errorResult.error
              : String(errorResult.error),
          status: errorResult.status || 500,
          provider: 'github',
          hints: errorResult.hints,
        };
      }

      return {
        data: this.transformRepoStructureResult(
          result as unknown as GitHubRepoStructureData
        ),
        status: 200,
        provider: 'github',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformRepoStructureResult(
    data: GitHubRepoStructureData
  ): RepoStructureResult {
    return {
      projectPath: `${data.owner}/${data.repo}`,
      branch: data.branch || '',
      path: data.path || '/',
      structure: data.structure || {},
      summary: {
        totalFiles: data.summary?.totalFiles || 0,
        totalFolders: data.summary?.totalFolders || 0,
        truncated: data.summary?.truncated || false,
      },
      pagination: data.pagination,
      hints: data.hints,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Parse a unified projectId into owner and repo.
   * GitHub format: 'owner/repo'
   */
  private parseProjectId(projectId?: string): {
    owner?: string;
    repo?: string;
  } {
    if (!projectId) {
      return { owner: undefined, repo: undefined };
    }

    const parts = projectId.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid GitHub projectId format: '${projectId}'. Expected 'owner/repo'.`
      );
    }

    return { owner: parts[0], repo: parts[1] };
  }

  /**
   * Handle errors and convert to ProviderResponse.
   * Uses the sophisticated error handler from github/errors.ts to extract
   * rate limit information and proper status codes.
   */
  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleGitHubAPIError(error);

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'github',
      hints: apiError.hints,
      rateLimit: this.extractRateLimit(apiError),
    };
  }

  /**
   * Extract rate limit information from GitHubAPIError.
   * Converts the error's rate limit fields to the ProviderResponse format.
   */
  private extractRateLimit(
    apiError: GitHubAPIError
  ): ProviderResponse<never>['rateLimit'] {
    // Only return rateLimit if we have relevant information
    if (
      apiError.rateLimitRemaining === undefined &&
      apiError.retryAfter === undefined &&
      apiError.rateLimitReset === undefined
    ) {
      return undefined;
    }

    return {
      remaining: apiError.rateLimitRemaining ?? 0,
      // Convert ms timestamp to seconds, or calculate from retryAfter
      reset: apiError.rateLimitReset
        ? Math.floor(apiError.rateLimitReset / 1000)
        : Math.floor(Date.now() / 1000) + (apiError.retryAfter ?? 3600),
      retryAfter: apiError.retryAfter,
    };
  }
}
