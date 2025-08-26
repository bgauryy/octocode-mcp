import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubPullRequestsAPI } from '../github/index';
import { TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubPullRequestSearchQuery,
  GitHubPullRequestSearchBulkQuerySchema,
} from '../scheme/github_search_pull_requests';
import { GitHubPullRequestsSearchParams } from '../types/github-openapi';
import { generateHints } from './utils/hints_consolidated';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

const DESCRIPTION = `Search GitHub pull requests with intelligent filtering and comprehensive analysis.

Provides powerful pull request discovery across GitHub repositories with smart filtering capabilities,
error recovery, and context-aware suggestions. Perfect for understanding code reviews, tracking features,
and analyzing development workflows.

FEATURES:
- Comprehensive PR search: Find pull requests by state, author, labels, and more
- Direct PR fetching: Get specific pull requests by number (e.g., PR #123 from owner/repo)
- Smart filtering: By repository, review status, merge state, and activity
- Error recovery: Intelligent suggestions for failed searches
- Research optimization: Tailored hints based on research goals

BEST PRACTICES:
- Use specific keywords related to the features or changes you're looking for
- For known PR numbers: Use prNumber with owner/repo for efficient direct fetching
- Filter by state (open/closed) and review status for targeted results
- Leverage author and assignee filters for people-specific searches
- Specify research goals (debugging, analysis) for optimal guidance`;

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTION,
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
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Too many queries',
            customHints: ['Maximum 5 queries allowed per request'],
          });

          return createResult({
            isError: true,
            error: 'Too many queries. Maximum 5 queries allowed per request.',
            hints,
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
            isError: true,
            error: 'Query too long. Maximum 256 characters allowed.',
            hints,
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
            isError: true,
            error:
              'At least one valid search parameter, filter, or PR number is required.',
            hints,
          });
        }

        try {
          return await searchMultipleGitHubPullRequests(
            args.queries,
            args.verbose || false,
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
            isError: true,
            error: `Failed to search pull requests: ${errorMessage}`,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Search multiple GitHub pull requests in parallel
 */
async function searchMultipleGitHubPullRequests(
  queries: GitHubPullRequestSearchQuery[],
  _verbose: boolean = false,
  authInfo?: AuthInfo,
  _userContext?: import('./utils/withSecurityValidation').UserContext
): Promise<CallToolResult> {
  const results = await Promise.allSettled(
    queries.map(async (query, index) => {
      try {
        const result = await searchGitHubPullRequestsAPI(
          query as GitHubPullRequestsSearchParams,
          authInfo
        );
        return {
          queryId: `pr-search_${index + 1}`,
          data: result,
          metadata: {
            researchGoal: query.researchGoal,
            resultCount:
              'error' in result ? 0 : result.pull_requests?.length || 0,
            hasResults:
              'error' in result
                ? false
                : (result.pull_requests?.length || 0) > 0,
            searchType: 'error' in result ? 'error' : 'success',
            queryArgs: {
              ...query,
              id: `pr-search_${index + 1}`,
            },
          },
        };
      } catch (error) {
        return {
          queryId: `pr-search_${index + 1}`,
          data: {
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
            status: 500,
            hints: ['Internal error occurred during search'],
          },
          metadata: {
            researchGoal: query.researchGoal,
            resultCount: 0,
            hasResults: false,
            searchType: 'error',
            queryArgs: {
              id: `pr-search_${index + 1}`,
            },
          },
        };
      }
    })
  );

  // Process results
  const allResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        queryId: `pr-search_${index + 1}`,
        data: {
          error: result.reason?.message || 'Unknown error occurred',
          status: 500,
          hints: ['Promise rejected during search'],
        },
        metadata: {
          resultCount: 0,
          hasResults: false,
          searchType: 'error',
          queryArgs: {
            id: `pr-search_${index + 1}`,
          },
        },
      };
    }
  });

  const successfulResults = allResults.filter(
    result => !('error' in result.data) || result.data.error === undefined
  );

  const failedResults = allResults.filter(
    result => 'error' in result.data && result.data.error !== undefined
  );

  // Generate hints
  const hints = generateHints({
    toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    hasResults: successfulResults.some(r => r.metadata.hasResults),
    totalItems: successfulResults.reduce(
      (sum, r) => sum + r.metadata.resultCount,
      0
    ),
    researchGoal: queries[0]?.researchGoal
      ? String(queries[0].researchGoal)
      : undefined,
    queryContext: {
      owner: queries[0]?.owner
        ? Array.isArray(queries[0].owner)
          ? queries[0].owner.map(String)
          : String(queries[0].owner)
        : undefined,
      repo: queries[0]?.repo
        ? Array.isArray(queries[0].repo)
          ? queries[0].repo.map(String)
          : String(queries[0].repo)
        : undefined,
      queryTerms: queries[0]?.query ? [String(queries[0].query)] : [],
    },
  });

  return createResult({
    data: allResults,
    meta: {
      totalOperations: queries.length,
      successfulOperations: successfulResults.length,
      failedOperations: failedResults.length,
      researchGoal: queries[0]?.researchGoal,
    },
    hints,
  });
}
