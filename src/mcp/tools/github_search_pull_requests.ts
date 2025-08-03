import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubPullRequestsAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubPullRequestSearchQuery,
  GitHubPullRequestSearchQuerySchema,
} from './scheme/github_search_pull_requests';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Search GitHub pull requests with intelligent filtering and comprehensive analysis.

This tool provides powerful pull request discovery across GitHub repositories with smart
filtering capabilities, error recovery, and context-aware suggestions. Perfect for
understanding code reviews, tracking features, and analyzing development workflows.

Key Features:
- Comprehensive PR search: Find pull requests by state, author, labels, and more
- Smart filtering: By repository, review status, merge state, and activity
- Error recovery: Intelligent suggestions for failed searches
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Use specific keywords related to the features or changes you're looking for
- Filter by state (open/closed) and review status for targeted results
- Leverage author and assignee filters for people-specific searches
- Specify research goals (debugging, analysis) for optimal guidance
`;

export function registerSearchGitHubPullRequestsTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTION,
      inputSchema: GitHubPullRequestSearchQuerySchema.shape,
      annotations: {
        title: 'GitHub Pull Request Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubPullRequestSearchQuery): Promise<CallToolResult> => {
        // Validate that at least one search parameter is provided
        const hasQuery = args.query && args.query.trim();
        const hasFilters =
          args.owner || args.repo || args.author || args.assignee;

        if (!hasQuery && !hasFilters) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              totalItems: 0,
              errorMessage: 'Search parameters required',
              customHints: [
                'Provide a search query or filters (owner, repo, author, assignee)',
                'Example: query: "fix bug" or author: "username"',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'At least one search parameter or filter is required',
            hints,
          });
        }

        if (args.query && args.query.length > 256) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              errorMessage: 'Query too long',
              customHints: ['Use shorter, more focused search terms'],
            }
          );

          return createResult({
            isError: true,
            error: 'Query too long. Please use a shorter search query.',
            hints,
          });
        }

        try {
          const result = await searchGitHubPullRequestsAPI(args, opts.ghToken);

          // Check if result is an error
          if ('error' in result) {
            const hints = generateToolHints(
              TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
              {
                hasResults: false,
                totalItems: 0,
                errorMessage: result.error,
                customHints: result.hints || [],
                researchGoal: args.researchGoal,
              }
            );
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - generate intelligent hints
          const responseContext = {
            foundRepositories: result.pull_requests
              .map(pr => (pr as any).repository?.full_name || 'unknown')
              .filter((repo, index, arr) => arr.indexOf(repo) === index),
            dataQuality: {
              hasContent: result.pull_requests.length > 0,
              hasMatches: result.pull_requests.some(
                pr => pr.body && pr.body.length > 0
              ),
            },
          };

          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: result.pull_requests.length > 0,
              totalItems: result.pull_requests.length,
              researchGoal: args.researchGoal,
              responseContext,
              queryContext: {
                owner: Array.isArray(args.owner) ? args.owner[0] : args.owner,
                repo: Array.isArray(args.repo) ? args.repo[0] : args.repo,
                queryTerms: args.query ? [args.query] : [],
              },
            }
          );

          return createResult({
            data: {
              data: {
                ...result,
                apiSource: true,
              },
              meta: {
                totalResults: result.pull_requests?.length || 0,
                researchGoal: args.researchGoal,
              },
              hints,
            },
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              totalItems: 0,
              errorMessage,
              researchGoal: args.researchGoal,
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
