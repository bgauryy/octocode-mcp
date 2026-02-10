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

// Import extracted modules
import * as gitlabSearch from './gitlabSearch.js';
import * as gitlabContent from './gitlabContent.js';
import * as gitlabPullRequests from './gitlabPullRequests.js';
import * as gitlabStructure from './gitlabStructure.js';

import { handleGitLabAPIError } from '../../gitlab/errors.js';
import type { GitLabAPIError } from '../../gitlab/types.js';

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
   * Map sort field to GitLab format.
   */
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

  /**
   * Map MR state to GitLab format.
   */
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
