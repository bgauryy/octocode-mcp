/**
 * GitLab Provider Adapter
 *
 * Implements the ICodeHostProvider interface by wrapping GitLab API functions.
 * This adapter transforms unified query/result types to/from GitLab-specific formats.
 *
 * @module providers/gitlab/GitLabProvider
 */

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

// Import GitLab API functions
import { searchGitLabCodeAPI } from '../../gitlab/codeSearch.js';
import {
  fetchGitLabFileContentAPI,
  getGitLabDefaultBranch,
} from '../../gitlab/fileContent.js';
import { searchGitLabProjectsAPI } from '../../gitlab/projectsSearch.js';
import {
  searchGitLabMergeRequestsAPI,
  getGitLabMRNotes,
} from '../../gitlab/mergeRequests.js';
import { viewGitLabRepositoryStructureAPI } from '../../gitlab/repoStructure.js';

// Import GitLab types
import { handleGitLabAPIError } from '../../gitlab/errors.js';
import type {
  GitLabAPIError,
  GitLabCodeSearchItem,
  GitLabProject,
} from '../../gitlab/types.js';

// Internal interfaces for type safety
interface GitLabPaginationData {
  currentPage?: number;
  totalPages?: number;
  hasMore?: boolean;
  totalMatches?: number;
}

interface GitLabMRAssignee {
  username?: string;
}

interface GitLabMRNote {
  id: string | number;
  author?: { username?: string };
  body?: string;
  created_at?: string;
  updated_at?: string;
}

interface GitLabMRData {
  iid: number;
  title: string;
  description?: string;
  web_url: string;
  state: string;
  draft?: boolean;
  work_in_progress?: boolean;
  author?: { username?: string };
  assignees?: GitLabMRAssignee[];
  labels?: string[];
  source_branch: string;
  target_branch: string;
  diff_refs?: { head_sha?: string; base_sha?: string };
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  merged_at?: string;
  user_notes_count?: number;
  _notes?: GitLabMRNote[];
}

/**
 * GitLab Provider implementation.
 *
 * Wraps GitLab API functions to conform to the unified ICodeHostProvider interface.
 */
export class GitLabProvider implements ICodeHostProvider {
  readonly type = 'gitlab' as const;

  constructor(_config?: ProviderConfig) {
    // Config may be used in the future for token/host customization
  }

  // ============================================================================
  // CODE SEARCH
  // ============================================================================

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
      const projectId = this.parseProjectId(query.projectId);

      const gitlabQuery = {
        search: query.keywords.join(' '),
        projectId,
        path: query.path,
        filename: query.filename,
        extension: query.extension,
        ref: query.ref,
        perPage: query.limit,
        page: query.page,
      };

      const result = await searchGitLabCodeAPI(gitlabQuery);

      if ('error' in result && result.error) {
        return {
          error: result.error,
          status: result.status || 500,
          provider: 'gitlab',
          hints: 'hints' in result ? result.hints : undefined,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitLab API',
          status: 500,
          provider: 'gitlab',
        };
      }

      return {
        data: this.transformCodeSearchResult(result.data.items, query),
        status: 200,
        provider: 'gitlab',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformCodeSearchResult(
    items: GitLabCodeSearchItem[],
    query: CodeSearchQuery
  ): CodeSearchResult {
    const transformedItems: CodeSearchItem[] = items.map(item => ({
      path: item.path,
      matches: [
        {
          context: item.data,
          positions: [] as [number, number][],
        },
      ],
      url: '', // GitLab code search doesn't return URL directly
      repository: {
        id: String(item.project_id),
        name: String(item.project_id),
        url: '',
      },
    }));

    return {
      items: transformedItems,
      totalCount: items.length,
      pagination: {
        currentPage: query.page || 1,
        totalPages: 1,
        hasMore: items.length === (query.limit || 20),
      },
    };
  }

  // ============================================================================
  // FILE CONTENT
  // ============================================================================

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      const projectId = this.parseProjectId(query.projectId);

      // GitLab requires ref - get default branch if not specified
      let ref = query.ref;
      if (!ref) {
        ref = await getGitLabDefaultBranch(projectId);
      }

      const gitlabQuery = {
        projectId,
        path: query.path,
        ref,
        startLine: query.startLine,
        endLine: query.endLine,
      };

      const result = await fetchGitLabFileContentAPI(gitlabQuery);

      if ('error' in result && result.error) {
        return {
          error: result.error,
          status: result.status || 500,
          provider: 'gitlab',
          hints: 'hints' in result ? result.hints : undefined,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitLab API',
          status: 500,
          provider: 'gitlab',
        };
      }

      return {
        data: {
          path: result.data.file_path,
          content: result.data.content,
          encoding: 'utf-8',
          size: result.data.size,
          ref: result.data.ref,
          lastCommitSha: result.data.last_commit_id,
        },
        status: 200,
        provider: 'gitlab',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // REPO SEARCH
  // ============================================================================

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    try {
      const gitlabQuery = {
        search: query.keywords?.join(' '),
        topic: query.topics?.[0], // GitLab only supports single topic
        visibility: query.visibility,
        minStars: query.minStars,
        orderBy: this.mapSortField(query.sort),
        sort: query.order,
        perPage: query.limit,
        page: query.page,
      };

      const result = await searchGitLabProjectsAPI(gitlabQuery);

      if ('error' in result && result.error) {
        return {
          error: result.error,
          status: result.status || 500,
          provider: 'gitlab',
          hints: 'hints' in result ? result.hints : undefined,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitLab API',
          status: 500,
          provider: 'gitlab',
        };
      }

      return {
        data: this.transformRepoSearchResult(
          result.data.projects,
          result.data.pagination
        ),
        status: 200,
        provider: 'gitlab',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformRepoSearchResult(
    projects: GitLabProject[],
    pagination: GitLabPaginationData | undefined
  ): RepoSearchResult {
    const repositories: UnifiedRepository[] = projects.map(project => ({
      id: String(project.id),
      name: project.name,
      fullPath: project.path_with_namespace,
      description: project.description,
      url: project.web_url,
      cloneUrl: project.http_url_to_repo,
      defaultBranch: project.default_branch,
      stars: project.star_count,
      forks: project.forks_count,
      visibility: project.visibility,
      topics: project.topics || project.tag_list || [],
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      lastActivityAt: project.last_activity_at,
      openIssuesCount: project.open_issues_count,
      archived: project.archived,
    }));

    return {
      repositories,
      totalCount: pagination?.totalMatches || repositories.length,
      pagination: {
        currentPage: pagination?.currentPage || 1,
        totalPages: pagination?.totalPages || 1,
        hasMore: pagination?.hasMore || false,
        totalMatches: pagination?.totalMatches,
      },
    };
  }

  private mapSortField(
    sort?: string
  ):
    | 'id'
    | 'name'
    | 'path'
    | 'created_at'
    | 'updated_at'
    | 'last_activity_at'
    | 'similarity'
    | 'star_count'
    | undefined {
    const mapping: Record<
      string,
      | 'id'
      | 'name'
      | 'path'
      | 'created_at'
      | 'updated_at'
      | 'last_activity_at'
      | 'similarity'
      | 'star_count'
    > = {
      stars: 'star_count',
      updated: 'updated_at',
      created: 'created_at',
    };
    return sort ? mapping[sort] : undefined;
  }

  // ============================================================================
  // PULL REQUEST (MERGE REQUEST) SEARCH
  // ============================================================================

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      const projectId = query.projectId
        ? this.parseProjectId(query.projectId)
        : undefined;

      const gitlabQuery = {
        projectId,
        iid: query.number, // GitLab uses iid for project-scoped MR number
        state: this.mapMRState(query.state),
        authorUsername: query.author,
        assigneeUsername: query.assignee,
        labels: query.labels,
        sourceBranch: query.headBranch,
        targetBranch: query.baseBranch,
        createdAfter: query.created,
        updatedAfter: query.updated,
        orderBy: (query.sort === 'created'
          ? 'created_at'
          : query.sort === 'updated'
            ? 'updated_at'
            : undefined) as 'created_at' | 'updated_at' | undefined,
        sort: query.order,
        perPage: query.limit,
        page: query.page,
      };

      const result = await searchGitLabMergeRequestsAPI(gitlabQuery);

      if ('error' in result && result.error) {
        return {
          error: result.error,
          status: result.status || 500,
          provider: 'gitlab',
          hints: 'hints' in result ? result.hints : undefined,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitLab API',
          status: 500,
          provider: 'gitlab',
        };
      }

      // Optionally fetch comments
      let mergeRequests = result.data.mergeRequests;
      if (query.withComments && projectId && mergeRequests.length > 0) {
        mergeRequests = await Promise.all(
          mergeRequests.map(async mr => {
            try {
              const notesResult = await getGitLabMRNotes(projectId, mr.iid);
              if ('data' in notesResult && notesResult.data) {
                return {
                  ...mr,
                  _notes: notesResult.data,
                };
              }
            } catch {
              // Ignore errors fetching notes
            }
            return mr;
          })
        );
      }

      return {
        data: this.transformPullRequestResult(
          mergeRequests as GitLabMRData[],
          result.data.pagination,
          query
        ),
        status: 200,
        provider: 'gitlab',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private transformPullRequestResult(
    mergeRequests: GitLabMRData[],
    pagination: GitLabPaginationData | undefined,
    _query: PullRequestQuery
  ): PullRequestSearchResult {
    const items: PullRequestItem[] = mergeRequests.map(mr => {
      // Map GitLab state to unified state
      let state: 'open' | 'closed' | 'merged';
      if (mr.state === 'merged') {
        state = 'merged';
      } else if (mr.state === 'closed') {
        state = 'closed';
      } else {
        state = 'open';
      }

      return {
        number: mr.iid,
        title: mr.title,
        body: mr.description ?? null,
        url: mr.web_url,
        state,
        draft: mr.draft || mr.work_in_progress || false,
        author: mr.author?.username || '',
        assignees: mr.assignees?.map(a => a.username ?? '') || [],
        labels: mr.labels || [],
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        sourceSha: mr.diff_refs?.head_sha,
        targetSha: mr.diff_refs?.base_sha,
        createdAt: mr.created_at ?? '',
        updatedAt: mr.updated_at ?? '',
        closedAt: mr.closed_at ?? undefined,
        mergedAt: mr.merged_at ?? undefined,
        commentsCount: mr.user_notes_count,
        comments: mr._notes?.map(note => ({
          id: String(note.id),
          author: note.author?.username || '',
          body: note.body ?? '',
          createdAt: note.created_at ?? '',
          updatedAt: note.updated_at ?? '',
        })),
      };
    });

    return {
      items,
      totalCount: pagination?.totalMatches || items.length,
      pagination: {
        currentPage: pagination?.currentPage || 1,
        totalPages: pagination?.totalPages || 1,
        hasMore: pagination?.hasMore || false,
        totalMatches: pagination?.totalMatches,
      },
    };
  }

  private mapMRState(
    state?: string
  ): 'opened' | 'closed' | 'merged' | 'all' | undefined {
    const mapping: Record<string, 'opened' | 'closed' | 'merged' | 'all'> = {
      open: 'opened',
      closed: 'closed',
      merged: 'merged',
      all: 'all',
    };
    return state ? mapping[state] : undefined;
  }

  // ============================================================================
  // REPO STRUCTURE
  // ============================================================================

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      const projectId = this.parseProjectId(query.projectId);

      const gitlabQuery = {
        projectId,
        ref: query.ref,
        path: query.path,
        recursive: query.recursive,
        perPage: query.entriesPerPage,
        page: query.entryPageNumber,
      };

      const result = await viewGitLabRepositoryStructureAPI(gitlabQuery);

      if ('error' in result && result.error) {
        return {
          error: result.error,
          status: result.status || 500,
          provider: 'gitlab',
          hints: 'hints' in result ? result.hints : undefined,
        };
      }

      if (!('data' in result) || !result.data) {
        return {
          error: 'No data returned from GitLab API',
          status: 500,
          provider: 'gitlab',
        };
      }

      return {
        data: {
          projectPath: result.data.projectPath,
          branch: result.data.branch,
          path: result.data.path,
          structure: result.data.structure,
          summary: result.data.summary,
          pagination: result.data.pagination,
          hints: result.data.hints,
        },
        status: 200,
        provider: 'gitlab',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Parse a unified projectId into GitLab format.
   * GitLab accepts: numeric ID or URL-encoded path
   */
  private parseProjectId(projectId?: string): number | string {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Check if it's a numeric ID
    const numId = parseInt(projectId, 10);
    if (!isNaN(numId) && String(numId) === projectId) {
      return numId;
    }

    // URL-encode the path for GitLab API
    return encodeURIComponent(projectId);
  }

  /**
   * Handle errors and convert to ProviderResponse.
   * Uses the sophisticated error handler from gitlab/errors.ts to extract
   * rate limit information and proper status codes.
   */
  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleGitLabAPIError(error);

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'gitlab',
      hints: apiError.hints,
      rateLimit: this.extractRateLimit(apiError),
    };
  }

  /**
   * Extract rate limit information from GitLabAPIError.
   * Converts the error's rate limit fields to the ProviderResponse format.
   */
  private extractRateLimit(
    apiError: GitLabAPIError
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
      // GitLab rateLimitReset is already in seconds (Unix timestamp)
      reset:
        apiError.rateLimitReset ??
        Math.floor(Date.now() / 1000) + (apiError.retryAfter ?? 60),
      retryAfter: apiError.retryAfter,
    };
  }
}
