import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubIssuesAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubIssueSearchQuery,
  GitHubIssueSearchQuerySchema,
} from './scheme/github_search_issues';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Search GitHub issues with intelligent filtering and comprehensive analysis.

This tool provides powerful issue discovery across GitHub repositories with smart
filtering capabilities, error recovery, and context-aware suggestions. Perfect for
debugging, research, and understanding project challenges.

Key Features:
- Comprehensive issue search: Find bugs, features, and discussions
- Smart filtering: By state, labels, assignees, and more
- Error recovery: Intelligent suggestions for failed searches
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Use specific keywords related to your problem or interest
- Filter by repository owner/repo for focused searches
- Leverage labels and state filters for targeted results
- Specify research goals (debugging, discovery) for optimal guidance
`;

export function registerSearchGitHubIssuesTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_ISSUES,
    {
      description: DESCRIPTION,
      inputSchema: GitHubIssueSearchQuerySchema.shape,
      annotations: {
        title: 'GitHub Issue Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubIssueSearchQuery): Promise<CallToolResult> => {
        if (!args.query?.trim()) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Search query is required',
            customHints: ['Provide keywords like "bug", "error", "feature"'],
          });

          return createResult({
            isError: true,
            error: 'Search query is required and cannot be empty',
            hints,
          });
        }

        if (args.query.length > 256) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
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

        try {
          const result = await searchGitHubIssuesAPI(args, opts.ghToken);

          // Check if result is an error
          if ('error' in result) {
            const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
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
            foundRepositories: result.issues
              .map(issue => issue.repository?.full_name || 'unknown')
              .filter((repo, index, arr) => arr.indexOf(repo) === index),
            dataQuality: {
              hasContent: result.issues.length > 0,
              hasMatches: result.issues.some(
                issue => issue.body && issue.body.length > 0
              ),
            },
          };

          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
            hasResults: result.issues.length > 0,
            totalItems: result.issues.length,
            researchGoal: args.researchGoal,
            responseContext,
            queryContext: {
              owner: args.owner,
              repo: args.repo,
              queryTerms: [args.query],
            },
          });

          return createResult({
            data: {
              data: {
                ...result,
                apiSource: true,
              },
              meta: {
                totalResults: result.issues?.length || 0,
                researchGoal: args.researchGoal,
              },
              hints,
            },
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
            hasResults: false,
            totalItems: 0,
            errorMessage,
            researchGoal: args.researchGoal,
          });

          return createResult({
            isError: true,
            error: `Failed to search issues: ${errorMessage}`,
            hints,
          });
        }
      }
    )
  );
}
