import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubPullRequestSearchQuery,
  PullRequestSearchResult,
} from '../../types.js';
import { searchGitHubPullRequestsAPI } from '../../github/pullRequestSearch.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
  createErrorResult,
} from '../utils.js';

/**
 * Search multiple GitHub pull requests using efficient bulk operations
 */
export async function searchMultipleGitHubPullRequests(
  queries: GitHubPullRequestSearchQuery[],
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubPullRequestSearchQuery, _index: number) => {
      try {
        const validationError = (query as unknown as Record<string, unknown>)
          ?._validationError;
        if (validationError && typeof validationError === 'string') {
          return createErrorResult(validationError, query);
        }

        const apiResult = await searchGitHubPullRequestsAPI(
          query,
          authInfo,
          sessionId
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const pullRequests = apiResult.pull_requests || [];

        const hasContent = pullRequests.length > 0;

        // Generate pagination hints
        const paginationHints: string[] = [];
        if (apiResult.pagination) {
          const { currentPage, totalPages, totalMatches, hasMore } =
            apiResult.pagination;
          paginationHints.push(
            `Page ${currentPage}/${totalPages} (showing ${pullRequests.length} of ${totalMatches} PRs)`
          );
          if (hasMore) {
            paginationHints.push(`Next: page=${currentPage + 1}`);
          }
          if (currentPage > 1) {
            paginationHints.push(`Previous: page=${currentPage - 1}`);
          }
          if (!hasMore) {
            paginationHints.push('Final page');
          }
          if (totalPages > 2) {
            paginationHints.push(
              `Jump to: page=1 (first) or page=${totalPages} (last)`
            );
          }
        }

        // Use unified pattern: context for dynamic hints, extraHints for pagination
        return createSuccessResult(
          query,
          {
            owner: query.owner,
            repo: query.repo,
            pull_requests: pullRequests,
            total_count: apiResult.total_count || pullRequests.length,
            ...(apiResult.pagination && { pagination: apiResult.pagination }),
          },
          hasContent,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          {
            hintContext: { matchCount: pullRequests.length },
            extraHints: paginationHints,
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      keysPriority: [
        'owner',
        'repo',
        'pull_requests',
        'pagination',
        'total_count',
        'error',
      ] satisfies Array<keyof PullRequestSearchResult>,
    }
  );
}
