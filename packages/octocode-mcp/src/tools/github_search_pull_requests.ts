import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation.js';
import { searchGitHubPullRequestsAPI } from '../github/pullRequestSearch.js';
import { TOOL_NAMES } from '../constants.js';
import { GitHubPullRequestSearchBulkQuerySchema } from '../scheme/github_search_pull_requests.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { DESCRIPTIONS } from './descriptions.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
  createErrorResult,
} from './utils.js';
import type {
  GitHubPullRequestSearchQuery,
  PullRequestSearchResult,
} from '../types.js';

// PR-specific validation messages
const VALIDATION_MESSAGES = {
  QUERY_TOO_LONG: 'Query too long. Maximum 256 characters allowed.',
  MISSING_PARAMS:
    'At least one valid search parameter, filter, or PR number is required.',
} as const;

/**
 * Check if a query has a valid query string that exceeds the length limit
 */
function hasQueryLengthError(query: GitHubPullRequestSearchQuery): boolean {
  return Boolean(query?.query && String(query.query).length > 256);
}

/**
 * Check if a query has at least one valid search parameter
 */
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

/**
 * Add validation error to query
 */
function addValidationError(
  query: GitHubPullRequestSearchQuery,
  error: string
): GitHubPullRequestSearchQuery {
  return {
    ...query,
    _validationError: error,
  } as GitHubPullRequestSearchQuery;
}

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
      inputSchema: GitHubPullRequestSearchBulkQuerySchema.shape,
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
        userContext
      ): Promise<CallToolResult> => {
        let queries = args.queries || [];

        // Validate query length
        const longQueryIndex = queries.findIndex(hasQueryLengthError);
        if (longQueryIndex !== -1) {
          queries = queries.map((q, i) =>
            i === longQueryIndex
              ? addValidationError(q, VALIDATION_MESSAGES.QUERY_TOO_LONG)
              : q
          );
        }

        // Validate at least one query has valid parameters
        if (queries.length > 0 && !queries.some(hasValidSearchParams)) {
          queries = queries.map((q, i) =>
            i === 0
              ? addValidationError(q, VALIDATION_MESSAGES.MISSING_PARAMS)
              : q
          );
        }

        return searchMultipleGitHubPullRequests(queries, authInfo, userContext);
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
  userContext?: UserContext
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubPullRequestSearchQuery, _index: number) => {
      try {
        const validationError = (query as unknown as Record<string, unknown>)
          ?._validationError;
        if (validationError && typeof validationError === 'string') {
          return createErrorResult(query, validationError);
        }

        const apiResult = await searchGitHubPullRequestsAPI(
          query,
          authInfo,
          userContext
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const pullRequests = apiResult.pull_requests || [];

        return createSuccessResult(
          query,
          {
            pull_requests: pullRequests,
            total_count: apiResult.total_count || pullRequests.length,
            incomplete_results: apiResult.incomplete_results,
          },
          pullRequests.length > 0,
          'GITHUB_SEARCH_PULL_REQUESTS'
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      keysPriority: [
        'pull_requests',
        'total_count',
        'incomplete_results',
        'error',
      ] satisfies Array<keyof PullRequestSearchResult>,
    }
  );
}
