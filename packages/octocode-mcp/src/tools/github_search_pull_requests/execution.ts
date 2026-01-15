import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubPullRequestSearchQuery,
  PullRequestSearchResult,
} from '../../types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import {
  handleCatchError,
  createSuccessResult,
  createErrorResult,
} from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import { isProviderSuccess } from '../../providers/types.js';

export async function searchMultipleGitHubPullRequests(
  args: ToolExecutionArgs<GitHubPullRequestSearchQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();

  return executeBulkOperation(
    queries,
    async (query: GitHubPullRequestSearchQuery, _index: number) => {
      try {
        const validationError = (query as unknown as Record<string, unknown>)
          ?._validationError;
        if (validationError && typeof validationError === 'string') {
          return createErrorResult(validationError, query);
        }

        // Get provider instance
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });

        // Convert query to provider format
        const providerQuery = {
          projectId:
            query.owner && query.repo
              ? `${query.owner}/${query.repo}`
              : undefined,
          number: query.prNumber,
          state: query.state as
            | 'open'
            | 'closed'
            | 'merged'
            | 'all'
            | undefined,
          author: query.author,
          assignee: query.assignee,
          labels: query.label
            ? Array.isArray(query.label)
              ? query.label
              : [query.label]
            : undefined,
          baseBranch: query.base,
          headBranch: query.head,
          created: query.created,
          updated: query.updated,
          withComments: query.withComments,
          withCommits: query.withCommits,
          type: query.type as
            | 'metadata'
            | 'fullContent'
            | 'partialContent'
            | undefined,
          sort: query.sort as 'created' | 'updated' | 'best-match' | undefined,
          order: query.order as 'asc' | 'desc' | undefined,
          limit: query.limit,
          mainResearchGoal: query.mainResearchGoal,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };

        const apiResult = await provider.searchPullRequests(providerQuery);

        if (!isProviderSuccess(apiResult)) {
          return handleCatchError(
            new Error(apiResult.error || 'Provider error'),
            query
          );
        }

        // Transform provider response to tool result format
        const pullRequests = apiResult.data.items.map(pr => ({
          number: pr.number,
          title: pr.title,
          body: pr.body,
          url: pr.url,
          state: pr.state,
          draft: pr.draft,
          author: pr.author,
          assignees: pr.assignees,
          labels: pr.labels,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          closedAt: pr.closedAt,
          mergedAt: pr.mergedAt,
          commentsCount: pr.commentsCount,
          changedFilesCount: pr.changedFilesCount,
          additions: pr.additions,
          deletions: pr.deletions,
          ...(pr.comments && { comments: pr.comments }),
          ...(pr.fileChanges && { fileChanges: pr.fileChanges }),
        }));

        const hasContent = pullRequests.length > 0;

        const paginationHints: string[] = [];
        if (apiResult.data.pagination) {
          const { currentPage, totalPages, totalEntries, hasMore } =
            apiResult.data.pagination;
          const totalMatches = totalEntries || 0;

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

        // Transform pagination to expected format
        const resultPagination = apiResult.data.pagination
          ? {
              currentPage: apiResult.data.pagination.currentPage,
              totalPages: apiResult.data.pagination.totalPages,
              perPage: apiResult.data.pagination.entriesPerPage || 10,
              totalMatches: apiResult.data.pagination.totalEntries || 0,
              hasMore: apiResult.data.pagination.hasMore,
            }
          : undefined;

        return createSuccessResult(
          query,
          {
            owner: query.owner,
            repo: query.repo,
            pull_requests: pullRequests,
            total_count: apiResult.data.totalCount || pullRequests.length,
            ...(resultPagination && { pagination: resultPagination }),
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
