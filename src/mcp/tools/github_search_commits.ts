import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubCommitsAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubCommitSearchQuery,
  GitHubCommitSearchQuerySchema,
} from './scheme/github_search_commits';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Search GitHub commits with intelligent filtering and comprehensive analysis.

This tool provides powerful commit discovery across GitHub repositories with smart
filtering capabilities, error recovery, and context-aware suggestions. Perfect for
understanding code evolution, tracking changes, and analyzing development patterns.

Key Features:
- Comprehensive commit search: Find changes by author, message, date, and more
- Smart filtering: By repository, author, date ranges, and commit types
- Error recovery: Intelligent suggestions for failed searches
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Use specific keywords related to the changes you're looking for
- Filter by date ranges for targeted historical analysis
- Leverage author filters for developer-specific searches
- Specify research goals (debugging, analysis) for optimal guidance
`;

export function registerSearchGitHubCommitsTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    {
      description: DESCRIPTION,
      inputSchema: GitHubCommitSearchQuerySchema.shape,
      annotations: {
        title: 'GitHub Commit Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubCommitSearchQuery): Promise<CallToolResult> => {
        // Validate that at least one search parameter is provided
        const hasSearchTerms =
          args.exactQuery || args.queryTerms?.length || args.orTerms?.length;
        const hasFilters =
          args.author ||
          args.committer ||
          args.hash ||
          args['author-date'] ||
          args['committer-date'];

        if (!hasSearchTerms && !hasFilters) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Search parameters required',
            customHints: [
              'Provide search terms (exactQuery, queryTerms) or filters (author, hash, dates)',
              'Example: exactQuery: "fix bug" or author: "username"',
            ],
          });

          return createResult({
            isError: true,
            error: 'At least one search parameter or filter is required',
            hints,
          });
        }

        if (args.exactQuery && args.exactQuery.length > 256) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            errorMessage: 'Query too long',
            customHints: ['Use shorter, more focused search terms'],
          });

          return createResult({
            isError: true,
            error: 'Query too long. Please use a shorter search query.',
            hints,
          });
        }

        if (args.getChangesContent && (!args.owner || !args.repo)) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            errorMessage: 'Repository required for changes content',
            customHints: [
              'Specify both owner and repo when requesting commit changes',
            ],
          });

          return createResult({
            isError: true,
            error:
              'Both owner and repo are required when getChangesContent is true',
            hints,
          });
        }

        try {
          const result = await searchGitHubCommitsAPI(args, opts.ghToken);

          // Check if result is an error
          if ('error' in result) {
            const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
              hasResults: false,
              totalItems: 0,
              errorMessage: result.error,
              customHints: result.hints || [],
              researchGoal: args.researchGoal,
            });
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - generate intelligent hints
          const responseContext = {
            foundRepositories: result.commits
              .map(commit => commit.repository?.full_name || 'unknown')
              .filter((repo, index, arr) => arr.indexOf(repo) === index),
            dataQuality: {
              hasContent: result.commits.length > 0,
              hasMatches: result.commits.some(
                commit =>
                  commit.commit?.message && commit.commit.message.length > 0
              ),
            },
          };

          const searchTerms = [
            ...(args.exactQuery ? [args.exactQuery] : []),
            ...(args.queryTerms || []),
            ...(args.orTerms || []),
          ];

          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: result.commits.length > 0,
            totalItems: result.commits.length,
            researchGoal: args.researchGoal,
            responseContext,
            queryContext: {
              owner: args.owner,
              repo: args.repo,
              queryTerms: searchTerms,
            },
          });

          return createResult({
            data: {
              data: {
                ...result,
                apiSource: true,
              },
              meta: {
                totalResults: result.commits?.length || 0,
                researchGoal: args.researchGoal,
              },
              hints,
            },
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            totalItems: 0,
            errorMessage,
            researchGoal: args.researchGoal,
          });

          return createResult({
            isError: true,
            error: `Failed to search commits: ${errorMessage}`,
            hints,
          });
        }
      }
    )
  );
}
