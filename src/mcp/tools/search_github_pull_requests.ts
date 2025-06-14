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
        .optional()
        .default(50)
        .describe('Maximum number of pull requests to return (default: 50)'),
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
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubPullRequestsSearchParams) => {
      try {
        const result = await searchGitHubPullRequests(args);

        // Check for empty results and enhance with smart suggestions
        if (result.content && result.content[0]) {
          let responseText = result.content[0].text as string;
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

          if (resultCount === 0) {
            responseText += `

🔄 NO RESULTS RECOVERY STRATEGY:
• Try broader terms: "${args.query}" → "fix", "feature", "update"
• Implementation search: github_search_code for actual code changes
• Project discovery: github_search_repos for related projects
• Issue tracking: github_search_issues for related problems

💡 PR SEARCH OPTIMIZATION:
• Focus on action words: "implement", "add", "fix", "update"
• Try state filters: state=open vs state=closed
• Use review filters: draft=false for completed PRs

🔗 RECOMMENDED TOOL CHAIN:
1. github_search_issues - Find problems that needed solutions
2. github_search_code - See actual implementation patterns
3. github_search_repos - Discover projects with similar features`;
          } else if (resultCount <= 5) {
            responseText += `

💡 FEW RESULTS ENHANCEMENT:
• Found ${resultCount} PRs - try removing restrictive filters
• Alternative: github_search_code for implementation examples
• Cross-reference: github_search_issues for related discussions`;
          }

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub pull requests: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
