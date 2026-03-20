/**
 * Bitbucket Provider Adapter
 *
 * Implements the ICodeHostProvider interface for Bitbucket Cloud by delegating
 * provider operations to capability-specific modules.
 *
 * @module providers/bitbucket/BitbucketProvider
 */

import type {
  CodeSearchQuery,
  CodeSearchResult,
  FileContentQuery,
  FileContentResult,
  ICodeHostProvider,
  ProviderConfig,
  ProviderResponse,
  PullRequestQuery,
  PullRequestSearchResult,
  RepoSearchQuery,
  RepoSearchResult,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';
import * as bitbucketSearch from './bitbucketSearch.js';
import * as bitbucketContent from './bitbucketContent.js';
import * as bitbucketPullRequests from './bitbucketPullRequests.js';
import * as bitbucketStructure from './bitbucketStructure.js';
import { parseBitbucketProjectId, extractBitbucketRateLimit } from './utils.js';
import { getBitbucketDefaultBranch } from '../../bitbucket/fileContent.js';
import { handleBitbucketAPIError } from '../../bitbucket/errors.js';
import { logRateLimit } from '../../session.js';
import { PROVIDER_CAPABILITIES } from '../capabilities.js';

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket' as const;
  readonly capabilities = PROVIDER_CAPABILITIES.bitbucket;

  constructor(_config?: ProviderConfig) {}

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
      return await bitbucketSearch.searchCode(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      return await bitbucketContent.getFileContent(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    try {
      return await bitbucketSearch.searchRepos(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      return await bitbucketPullRequests.searchPullRequests(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      return await bitbucketStructure.getRepoStructure(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveDefaultBranch(projectId: string): Promise<string> {
    try {
      const { workspace, repoSlug } = parseBitbucketProjectId(projectId);
      return await getBitbucketDefaultBranch(workspace, repoSlug);
    } catch {
      return 'main';
    }
  }

  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleBitbucketAPIError(error);
    const rateLimit = extractBitbucketRateLimit(apiError);

    if (rateLimit) {
      void logRateLimit({
        limit_type: 'primary',
        retry_after_seconds: rateLimit.retryAfter,
        rate_limit_remaining: rateLimit.remaining,
        rate_limit_reset_ms: rateLimit.reset * 1000,
        provider: 'bitbucket',
      });
    }

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'bitbucket',
      hints: apiError.hints,
      rateLimit,
    };
  }
}
