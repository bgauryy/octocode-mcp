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
import * as githubSearch from './githubSearch.js';
import * as githubContent from './githubContent.js';
import * as githubPullRequests from './githubPullRequests.js';
import * as githubStructure from './githubStructure.js';

import type { GitHubAPIError } from '../../github/githubAPI.js';
import { handleGitHubAPIError } from '../../github/errors.js';

/**
 * GitHub Provider implementation.
 *
 * Wraps existing GitHub API functions to conform to the unified ICodeHostProvider interface.
 */
export class GitHubProvider implements ICodeHostProvider {
  readonly type = 'github' as const;
  private authInfo?: AuthInfo;

  constructor(config?: ProviderConfig) {
    // Use AuthInfo if provided, otherwise construct from token
    // The type assertion is safe because we only use the 'token' field from AuthInfo
    // (see src/github/client.ts getOctokit function which accesses authInfo?.token)
    if (config?.authInfo) {
      this.authInfo = config.authInfo;
    } else if (config?.token) {
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
      return await githubSearch.searchCode(
        query,
        this.authInfo,
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
      return await githubContent.getFileContent(
        query,
        this.authInfo,
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
      return await githubSearch.searchRepos(query, this.authInfo);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // PULL REQUEST SEARCH
  // ============================================================================

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      return await githubPullRequests.searchPullRequests(
        query,
        this.authInfo,
        this.parseProjectId.bind(this)
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
      return await githubStructure.getRepoStructure(
        query,
        this.authInfo,
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
