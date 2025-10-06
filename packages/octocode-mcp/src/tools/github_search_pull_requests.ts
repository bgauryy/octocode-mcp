import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubPullRequestsAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubPullRequestSearchQuery,
  GitHubPullRequestSearchBulkQuerySchema,
} from '../scheme/github_search_pull_requests';
import { GitHubPullRequestsSearchParams } from '../github/githubAPI';
import { generateEmptyQueryHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import {
  PR_QUERY_LENGTH_VALIDATION,
  PR_VALID_PARAMS_VALIDATION,
  ERROR_RECOVERY_TOOL,
} from './hintsContent';
import { DESCRIPTIONS } from './descriptions';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
  type ProcessedBulkResult,
} from '../utils/bulkOperations';

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
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateEmptyQueryHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
          );

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        // Check for overly long queries (business logic validation)
        const longQuery = args.queries.find(
          query => query?.query && String(query.query).length > 256
        );
        if (longQuery) {
          return createResult({
            data: { error: PR_QUERY_LENGTH_VALIDATION.message },
            hints: PR_QUERY_LENGTH_VALIDATION.hints,
            isError: true,
          });
        }

        // Basic validation - schema handles detailed validation
        const hasValidQueries = args.queries.some(
          query =>
            query?.query?.trim() ||
            query?.owner ||
            query?.repo ||
            query?.author ||
            query?.assignee ||
            (query?.prNumber && query?.owner && query?.repo)
        );

        if (!hasValidQueries) {
          return createResult({
            data: {
              error: PR_VALID_PARAMS_VALIDATION.message,
            },
            hints: PR_VALID_PARAMS_VALIDATION.hints,
            isError: true,
          });
        }

        try {
          return await searchMultipleGitHubPullRequests(
            args.queries,
            authInfo,
            userContext
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          return createResult({
            data: { error: `Failed to search pull requests: ${errorMessage}` },
            hints: ERROR_RECOVERY_TOOL[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
            isError: true,
          });
        }
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
  userContext?: import('../security/withSecurityValidation').UserContext
): Promise<CallToolResult> {
  const { results, errors } = await processBulkQueries(
    queries,
    async (
      query: GitHubPullRequestSearchQuery,
      _index: number
    ): Promise<ProcessedBulkResult> => {
      try {
        const apiResult = await searchGitHubPullRequestsAPI(
          query as GitHubPullRequestsSearchParams,
          authInfo,
          userContext
        );

        if ('error' in apiResult) {
          return {
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            suggestions: query.suggestions,
            error: apiResult.error,
            metadata: {},
          } as ProcessedBulkResult;
        }

        // Extract pull request data
        const pullRequests = apiResult.pull_requests || [];
        const hasResults = pullRequests.length > 0;

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          suggestions: query.suggestions,
          pull_requests: pullRequests,
          total_count: apiResult.total_count || pullRequests.length,
          metadata: {
            resultCount: pullRequests.length,
            hasResults,
            searchType: 'success',
          },
        } as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          suggestions: query.suggestions,
          error: errorMessage,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    keysPriority: [
      'researchGoal',
      'reasoning',
      'suggestions',
      'pull_requests',
      'total_count',
    ],
  };

  return createBulkResponse(config, results, errors, queries);
}
