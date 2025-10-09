import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { searchGitHubPullRequestsAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubPullRequestSearchQuery,
  GitHubPullRequestSearchBulkQuerySchema,
  type PullRequestSearchResult,
} from '../scheme/github_search_pull_requests';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import {
  PR_QUERY_LENGTH_VALIDATION,
  PR_VALID_PARAMS_VALIDATION,
} from './hintsContent';
import { DESCRIPTIONS } from './descriptions';
import { executeBulkOperation } from '../utils/bulkOperations';

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
        // executeBulkOperation handles empty arrays gracefully
        const queries = args.queries || [];

        // Custom validation for PR-specific rules
        // Check for overly long queries (business logic validation)
        const longQueryIndex = queries.findIndex(
          query => query?.query && String(query.query).length > 256
        );
        if (longQueryIndex !== -1) {
          // Return error by modifying the query to trigger error in processor
          queries[longQueryIndex] = {
            ...queries[longQueryIndex],
            _validationError: PR_QUERY_LENGTH_VALIDATION.message,
          } as GitHubPullRequestSearchQuery;
        }

        // Basic validation - check if at least one query has valid parameters
        const hasValidQueries = queries.some(
          query =>
            query?.query?.trim() ||
            query?.owner ||
            query?.repo ||
            query?.author ||
            query?.assignee ||
            (query?.prNumber && query?.owner && query?.repo)
        );

        if (!hasValidQueries && queries.length > 0) {
          // Add validation error to first query
          queries[0] = {
            ...queries[0],
            _validationError: PR_VALID_PARAMS_VALIDATION.message,
          } as GitHubPullRequestSearchQuery;
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
        // Check for validation errors passed from handler
        const validationError = (query as unknown as Record<string, unknown>)
          ?._validationError;
        if (validationError && typeof validationError === 'string') {
          return {
            status: 'error',
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            error: validationError,
          };
        }

        // GitHubPullRequestSearchQuery is compatible with GitHubPullRequestsSearchParams
        const apiResult = await searchGitHubPullRequestsAPI(
          query,
          authInfo,
          userContext
        );

        if ('error' in apiResult) {
          return {
            status: 'error',
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            error: apiResult.error,
          };
        }

        // Extract pull request data
        const pullRequests = apiResult.pull_requests || [];

        return {
          status: pullRequests.length === 0 ? 'empty' : 'hasResults',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          pull_requests: pullRequests,
          total_count: apiResult.total_count || pullRequests.length,
          incomplete_results: apiResult.incomplete_results,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          status: 'error',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          error: errorMessage,
        };
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
