import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubPullRequestsAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubPullRequestSearchQuery,
  GitHubPullRequestSearchBulkQuerySchema,
} from './scheme/github_search_pull_requests';
import { generateToolHints } from './utils/hints_consolidated';

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

export function registerSearchGitHubPullRequestsTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
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
      async (args: {
        queries: GitHubPullRequestSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              totalItems: 0,
              errorMessage: 'Queries array is required and cannot be empty',
              customHints: [
                'Provide at least one search query with owner/repo or prNumber',
                'Example: queries: [{owner: "user", repo: "repo", prNumber: 123}]',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              totalItems: 0,
              errorMessage: 'Too many queries',
              customHints: ['Maximum 5 queries allowed per request'],
            }
          );

          return createResult({
            isError: true,
            error: 'Too many queries. Maximum 5 queries allowed per request.',
            hints,
          });
        }

        // Validate each query
        for (let i = 0; i < args.queries.length; i++) {
          const query = args.queries[i];
          const hasQuery = query.query && query.query.trim();
          const hasFilters =
            query.owner || query.repo || query.author || query.assignee;
          const hasPrNumber = query.prNumber && query.owner && query.repo;

          if (!hasQuery && !hasFilters && !hasPrNumber) {
            const hints = generateToolHints(
              TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
              {
                hasResults: false,
                totalItems: 0,
                errorMessage: `Query ${i + 1} has no valid parameters`,
                customHints: [
                  'Each query must have: query terms, filters (owner/repo), or prNumber with owner/repo',
                  `Query ${i + 1} is missing required parameters`,
                ],
              }
            );

            return createResult({
              isError: true,
              error: `Query ${i + 1} has no valid parameters. At least one search parameter, filter, or PR number is required.`,
              hints,
            });
          }

          if (query.query && query.query.length > 256) {
            const hints = generateToolHints(
              TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
              {
                hasResults: false,
                errorMessage: `Query ${i + 1} query too long`,
                customHints: ['Use shorter, more focused search terms'],
              }
            );

            return createResult({
              isError: true,
              error: `Query ${i + 1} query too long. Please use a shorter search query.`,
              hints,
            });
          }
        }

        try {
          return await searchMultipleGitHubPullRequests(
            args.queries,
            args.verbose || false,
            opts
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              totalItems: 0,
              errorMessage,
            }
          );

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
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const results = await Promise.allSettled(
    queries.map(async (query, index) => {
      try {
        const result = await searchGitHubPullRequestsAPI(query, opts.ghToken);
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
  const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, {
    hasResults: successfulResults.some(r => r.metadata.hasResults),
    totalItems: successfulResults.reduce(
      (sum, r) => sum + r.metadata.resultCount,
      0
    ),
    researchGoal: queries[0]?.researchGoal,
    queryContext: {
      owner: queries[0]?.owner,
      repo: queries[0]?.repo,
      queryTerms: queries[0]?.query ? [queries[0].query] : [],
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
