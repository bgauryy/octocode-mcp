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
import { GitHubPullRequestsSearchParams } from '../github/github-openapi';
import { generateHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';
import {
  ensureUniqueQueryIds,
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
      async (
        args: {
          queries: GitHubPullRequestSearchQuery[];
          verbose?: boolean;
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one search query with owner/repo or prNumber',
              'Example: queries: [{owner: "user", repo: "repo", prNumber: 123}]',
            ],
          });

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
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Query too long',
            customHints: [
              'Use shorter, more focused search terms',
              'Maximum query length is 256 characters',
            ],
          });

          return createResult({
            data: { error: 'Query too long. Maximum 256 characters allowed.' },
            hints,
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
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'No valid queries provided',
            customHints: [
              'Each query must have: query terms, filters (owner/repo), or prNumber with owner/repo',
            ],
          });

          return createResult({
            data: {
              error:
                'At least one valid search parameter, filter, or PR number is required.',
            },
            hints,
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

          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            totalItems: 0,
            errorMessage,
          });

          return createResult({
            data: { error: `Failed to search pull requests: ${errorMessage}` },
            hints,
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
  const uniqueQueries = ensureUniqueQueryIds(queries, 'pr-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubPullRequestSearchQuery & { id: string }
    ): Promise<ProcessedBulkResult> => {
      try {
        const apiResult = await searchGitHubPullRequestsAPI(
          query as GitHubPullRequestsSearchParams,
          authInfo,
          userContext
        );

        if ('error' in apiResult) {
          // Generate hints for this specific query error
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            errorMessage: apiResult.error,
          });

          return {
            queryId: query.id,
            reasoning: query.reasoning,
            error: apiResult.error,
            hints,
            metadata: {},
          } as ProcessedBulkResult;
        }

        // Extract pull request data
        const pullRequests = apiResult.pull_requests || [];
        const hasResults = pullRequests.length > 0;

        return {
          queryId: query.id,
          reasoning: query.reasoning,
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

        const hints = generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          hasResults: false,
          errorMessage,
        });

        return {
          queryId: query.id,
          reasoning: query.reasoning,
          error: errorMessage,
          hints,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  // Build aggregated context
  const successfulCount = results.filter(r => !r.result.error).length;
  const aggregatedContext = {
    totalQueries: results.length,
    successfulQueries: successfulCount,
    failedQueries: results.length - successfulCount,
    dataQuality: {
      hasResults: results.some(r => {
        const prResult = r.result as ProcessedBulkResult & {
          pull_requests?: unknown[];
        };
        return (
          !prResult.error &&
          prResult.pull_requests &&
          prResult.pull_requests.length > 0
        );
      }),
    },
  };

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    maxHints: 8,
    keysPriority: ['queryId', 'reasoning', 'pullRequests'],
  };

  // Create standardized response - bulk operations handles all hint generation and formatting
  return createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries
  );
}
