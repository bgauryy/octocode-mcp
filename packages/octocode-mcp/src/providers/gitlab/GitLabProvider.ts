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
  FileContentQuery,
  FileContentResult,
  RepoSearchQuery,
  RepoSearchResult,
  PullRequestQuery,
  PullRequestSearchResult,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';

import * as gitlabSearch from './gitlabSearch.js';
import * as gitlabContent from './gitlabContent.js';
import * as gitlabPullRequests from './gitlabPullRequests.js';
import * as gitlabStructure from './gitlabStructure.js';

import { handleGitLabAPIError } from '../../gitlab/errors.js';
import type { GitLabAPIError } from '../../gitlab/types.js';
import { getGitlab } from '../../gitlab/client.js';
import { logRateLimit } from '../../session.js';

/**
 * GitLab Provider implementation.
 *
 * Wraps GitLab API functions to conform to the unified ICodeHostProvider interface.
 */
export class GitLabProvider implements ICodeHostProvider {
  readonly type = 'gitlab' as const;
  private config?: ProviderConfig;

  constructor(config?: ProviderConfig) {
    this.config = config;
  }

  // ============================================================================
  // CODE SEARCH
  // ============================================================================

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
      return await gitlabSearch.searchCode(
        query,
        this.parseProjectId.bind(this)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // FILE CONTENT
  // ============================================================================

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      return await gitlabContent.getFileContent(
        query,
        this.parseProjectId.bind(this)
      );
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
      return await gitlabSearch.searchRepos(
        query,
        this.mapSortField.bind(this)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // PULL REQUEST (MERGE REQUEST) SEARCH
  // ============================================================================

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      return await gitlabPullRequests.searchPullRequests(
        query,
        this.parseProjectId.bind(this),
        this.mapMRState.bind(this)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // REPO STRUCTURE
  // ============================================================================

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      return await gitlabStructure.getRepoStructure(
        query,
        this.parseProjectId.bind(this)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // DEFAULT BRANCH RESOLUTION
  // ============================================================================

  async resolveDefaultBranch(projectId: string): Promise<string> {
    try {
      const gitlab = await getGitlab(
        this.config?.baseUrl || this.config?.token
          ? { host: this.config.baseUrl, token: this.config.token }
          : undefined
      );
      const parsedId = this.parseProjectId(projectId);
      const project = (await gitlab.Projects.show(
        parsedId
      )) as unknown as Record<string, unknown>;
      return String(project.default_branch || 'main');
    } catch {
      return 'main';
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private parseProjectId(projectId?: string): number | string {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    const numId = parseInt(projectId, 10);
    if (!isNaN(numId) && String(numId) === projectId) {
      return numId;
    }

    return encodeURIComponent(projectId);
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

  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleGitLabAPIError(error);
    const rateLimit = this.extractRateLimit(apiError);

    if (rateLimit) {
      void logRateLimit({
        limit_type: 'primary',
        retry_after_seconds: rateLimit.retryAfter,
        rate_limit_remaining: rateLimit.remaining,
        rate_limit_reset_ms: rateLimit.reset * 1000,
        provider: 'gitlab',
      });
    }

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'gitlab',
      hints: apiError.hints,
      rateLimit,
    };
  }

  private extractRateLimit(
    apiError: GitLabAPIError
  ): ProviderResponse<never>['rateLimit'] {
    if (
      apiError.rateLimitRemaining === undefined &&
      apiError.retryAfter === undefined &&
      apiError.rateLimitReset === undefined
    ) {
      return undefined;
    }

    const reset =
      apiError.rateLimitReset ??
      (apiError.retryAfter !== undefined
        ? Math.floor(Date.now() / 1000) + apiError.retryAfter
        : undefined);

    if (reset === undefined) {
      return undefined;
    }

    return {
      remaining: apiError.rateLimitRemaining ?? 0,
      reset,
      retryAfter: apiError.retryAfter,
    };
  }
}
