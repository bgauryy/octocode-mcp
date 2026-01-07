import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubPullRequestSearchQuery,
  PullRequestSearchResult,
} from '../types.js';
import { searchGitHubPullRequestsAPI } from '../github/pullRequestSearch.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { GitHubPullRequestSearchBulkQuerySchema } from '../scheme/github_search_pull_requests.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { executeBulkOperation } from '../utils/response/bulk.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
  createErrorResult,
  invokeCallbackSafely,
} from './utils.js';

const VALIDATION_MESSAGES = {
  QUERY_TOO_LONG: 'Query too long. Maximum 256 characters allowed.',
  MISSING_PARAMS:
    'At least one valid search parameter, filter, or PR number is required.',
} as const;

function hasQueryLengthError(query: GitHubPullRequestSearchQuery): boolean {
  return Boolean(query?.query && String(query.query).length > 256);
}

function hasValidSearchParams(query: GitHubPullRequestSearchQuery): boolean {
  return Boolean(
    query?.query?.trim() ||
    query?.owner ||
    query?.repo ||
    query?.author ||
    query?.assignee ||
    (query?.prNumber && query?.owner && query?.repo)
  );
}

function addValidationError(
  query: GitHubPullRequestSearchQuery,
  error: string
): GitHubPullRequestSearchQuery {
  return {
    ...query,
    _validationError: error,
  } as GitHubPullRequestSearchQuery;
}

export function registerSearchGitHubPullRequestsTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
      inputSchema: GitHubPullRequestSearchBulkQuerySchema,
      annotations: {
        title: 'GitHub Pull Request Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      async (
        args: {
          queries: GitHubPullRequestSearchQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        let queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          queries
        );

        const longQueryIndex = queries.findIndex(hasQueryLengthError);
        if (longQueryIndex !== -1) {
          queries = queries.map((q, i) =>
            i === longQueryIndex
              ? addValidationError(q, VALIDATION_MESSAGES.QUERY_TOO_LONG)
              : q
          );
        }

        if (queries.length > 0 && !queries.some(hasValidSearchParams)) {
          queries = queries.map((q, i) =>
            i === 0
              ? addValidationError(q, VALIDATION_MESSAGES.MISSING_PARAMS)
              : q
          );
        }

        return searchMultipleGitHubPullRequests(queries, authInfo, sessionId);
      }
    )
  );
}

/**
 * Search multiple GitHub pull requests using efficient bulk operations
 */
async function searchMultipleGitHubPullRequests(
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
