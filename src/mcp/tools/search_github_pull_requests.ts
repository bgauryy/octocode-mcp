import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubPullRequestsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubPullRequests } from '../../impl/github/searchGitHubPullRequests';

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find pull requests (e.g., 'bug fix', 'feature implementation', 'code review')"
        ),
      owner: z
        .string()
        .optional()
        .describe(
          `Filter by repository owner/organization (e.g., 'example-org')`
        ),
      repo: z
        .string()
        .optional()
        .describe("Filter by repository name (e.g., 'cli/cli')"),
      author: z.string().optional().describe('Filter by pull request author'),
      assignee: z.string().optional().describe('Filter by assignee'),
      mentions: z.string().optional().describe('Filter based on user mentions'),
      commenter: z
        .string()
        .optional()
        .describe('Filter based on comments by user'),
      involves: z
        .string()
        .optional()
        .describe('Filter based on involvement of user'),
      reviewedBy: z.string().optional().describe('Filter on user who reviewed'),
      reviewRequested: z
        .string()
        .optional()
        .describe('Filter on user or team requested to review'),
      state: z
        .enum(['open', 'closed'])
        .optional()
        .describe('Filter based on state'),
      head: z.string().optional().describe('Filter on head branch name'),
      base: z.string().optional().describe('Filter on base branch name'),
      language: z
        .string()
        .optional()
        .describe('Filter based on the coding language'),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on created at date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      updated: z.string().optional().describe('Filter on last updated at date'),
      mergedAt: z.string().optional().describe('Filter on merged at date'),
      closed: z.string().optional().describe('Filter on closed at date'),
      draft: z.boolean().optional().describe('Filter based on draft state'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe(
          'Maximum number of pull requests to return (default: 50, max: 100)'
        ),
      sort: z
        .enum([
          'comments',
          'reactions',
          'reactions-+1',
          'reactions--1',
          'reactions-smile',
          'reactions-thinking_face',
          'reactions-heart',
          'reactions-tada',
          'interactions',
          'created',
          'updated',
        ])
        .optional()
        .describe('Sort pull requests by specified criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
    },
    {
      title: 'Search GitHub Pull Requests',
      description:
        'Search pull requests for implementation analysis and code review insights. Essential for understanding development patterns, finding code examples, and tracking feature implementations.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubPullRequestsSearchParams) => {
      try {
        // Enhanced input validation
        if (!args.query || args.query.trim().length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        if (args.query.length > 256) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is too long. Please limit to 256 characters or less.',
              },
            ],
            isError: true,
          };
        }

        if (args.limit && (args.limit < 1 || args.limit > 100)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Limit must be between 1 and 100',
              },
            ],
            isError: true,
          };
        }

        // Validate date formats
        const dateFields = [
          { field: 'created', value: args.created },
          { field: 'updated', value: args.updated },
          { field: 'mergedAt', value: args.mergedAt },
          { field: 'closed', value: args.closed },
        ];

        for (const { field, value } of dateFields) {
          if (value && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(value)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${field} must be in format ">2022-01-01", "<2023-12-31", ">=2022-06-01", etc.`,
                },
              ],
              isError: true,
            };
          }
        }

        const result = await searchGitHubPullRequests(args);

        // Check for empty results and enhance with smart suggestions
        if (result.content && result.content[0]) {
          const responseText = result.content[0].text as string;
          let resultCount = 0;

          try {
            const parsed = JSON.parse(responseText);
            if (parsed.rawOutput) {
              const rawData = JSON.parse(parsed.rawOutput);
              resultCount = Array.isArray(rawData) ? rawData.length : 0;
            }
          } catch {
            const lines = responseText.split('\n').filter(line => line.trim());
            resultCount = Math.max(0, lines.length - 5);
          }

          // Provide structured summary for better usability
          const summary = {
            query: args.query,
            owner: args.owner || 'global search',
            repo: args.repo || 'all repositories',
            state: args.state || 'all states',
            totalResults: resultCount,
            sort: args.sort || 'best-match',
            timestamp: new Date().toISOString(),
            ...(resultCount === 0 && {
              suggestions: [
                'Try broader search terms (e.g., "bug", "feature", "fix")',
                'Remove repository/owner filters for global search',
                'Search for both open and closed PRs (remove state filter)',
                'Use different keywords related to code changes',
                'Try searching for specific programming languages',
              ],
            }),
          };

          let enhancedResponse = `# GitHub Pull Requests Search Results\n\n## Summary\n${JSON.stringify(summary, null, 2)}\n\n## Search Results\n${responseText}`;

          // Add context-specific guidance
          if (resultCount > 0) {
            enhancedResponse += `\n\n## Analysis Insights\n• Found ${resultCount} pull requests matching your criteria\n• Review merged PRs for implementation patterns\n• Check open PRs for ongoing development\n• Use review filters for code quality insights`;

            if (args.state === 'open') {
              enhancedResponse += `\n• OPEN PRs: Active development - good for current practices`;
            } else if (args.state === 'closed') {
              enhancedResponse += `\n• CLOSED PRs: Historical patterns - good for learning implementations`;
            } else {
              enhancedResponse += `\n• ALL STATES: Comprehensive view - includes both active and historical`;
            }

            if (args.draft === false) {
              enhancedResponse += `\n• NON-DRAFT PRs: Production-ready code - high quality examples`;
            }
          } else {
            enhancedResponse += `\n\n## Search Optimization Tips\n• START BROAD: Try keywords like "bug", "feature", "refactor", "update"\n• REMOVE FILTERS: Search globally first, then add specific filters\n• STATE SELECTION: Try both open and closed PRs\n• LANGUAGE FOCUS: Filter by programming language for specific examples\n• REVIEW FOCUS: Use reviewedBy filter for thoroughly vetted code`;
          }

          // Add PR-specific guidance
          enhancedResponse += `\n\n## Pull Request Analysis Guide\n• **Merged PRs**: Best for learning proven implementations\n• **Open PRs**: Good for current development patterns\n• **Draft PRs**: Work-in-progress, may contain experimental code\n• **Reviewed PRs**: Higher quality, thoroughly vetted code examples\n• **Recent PRs**: Current practices and modern implementations`;

          return {
            content: [
              {
                type: 'text',
                text: enhancedResponse,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Enhanced error analysis
        let specificSuggestions = '';
        if (
          errorMessage.includes('authentication') ||
          errorMessage.includes('401')
        ) {
          specificSuggestions = `\n\n🔒 AUTHENTICATION SOLUTIONS:\n• Check GitHub CLI authentication: gh auth status\n• Login if needed: gh auth login\n• Verify API permissions for PR search`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          specificSuggestions = `\n\n⏱️ RATE LIMIT SOLUTIONS:\n• Wait before retry (GitHub API limits)\n• Use authentication to increase limits\n• Reduce search scope with specific filters`;
        } else if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          specificSuggestions = `\n\n🔍 NOT FOUND SOLUTIONS:\n• Verify repository exists: ${args.owner}/${args.repo}\n• Check organization/user name spelling\n• Try global search without repository filters`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub pull requests: ${errorMessage}${specificSuggestions}\n\n🔧 GENERAL TROUBLESHOOTING:\n• Use simpler search terms (single keywords work best)\n• Remove restrictive filters for broader results\n• Try different states (open, closed, or both)\n• Search for common PR types: "bug fix", "feature", "refactor"\n• Use language filters for specific technology examples`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
