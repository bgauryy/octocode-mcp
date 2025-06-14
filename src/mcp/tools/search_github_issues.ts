import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubIssues } from '../../impl/github/searchGitHubIssues';

export function registerSearchGitHubIssuesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_ISSUES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_ISSUES],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find issues (e.g., 'bug fix', 'feature request', 'documentation')"
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org'). OPTIONAL: Leave empty for global searches across all of GitHub."
        ),
      repo: z
        .string()
        .optional()
        .describe(
          "Filter by specific repository name (e.g., 'cli/cli'). Note: Always do exploratory search without repo filter first"
        ),
      app: z.string().optional().describe('Filter by GitHub App author'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter based on the repository archived state'),
      assignee: z.string().optional().describe('Filter by assignee'),
      author: z.string().optional().describe('Filter by issue author'),
      closed: z.string().optional().describe('Filter on closed at date'),
      commenter: z
        .string()
        .optional()
        .describe('Filter based on comments by user'),
      comments: z.number().optional().describe('Filter on number of comments'),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on created at date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      includePrs: z
        .boolean()
        .optional()
        .describe('Include pull requests in results'),
      interactions: z
        .number()
        .optional()
        .describe('Filter on number of reactions and comments'),
      involves: z
        .string()
        .optional()
        .describe('Filter based on involvement of user'),
      labels: z
        .string()
        .optional()
        .describe(
          "Filter by labels (e.g., 'bug', 'enhancement', 'documentation')"
        ),
      language: z
        .string()
        .optional()
        .describe('Filter based on the coding language'),
      locked: z
        .boolean()
        .optional()
        .describe('Filter on locked conversation status'),
      match: z
        .enum(['title', 'body', 'comments'])
        .optional()
        .describe('Restrict search to specific field of issue'),
      mentions: z.string().optional().describe('Filter based on user mentions'),
      milestone: z.string().optional().describe('Filter by milestone title'),
      noAssignee: z.boolean().optional().describe('Filter on missing assignee'),
      noLabel: z.boolean().optional().describe('Filter on missing label'),
      noMilestone: z
        .boolean()
        .optional()
        .describe('Filter on missing milestone'),
      noProject: z.boolean().optional().describe('Filter on missing project'),
      project: z
        .string()
        .optional()
        .describe('Filter on project board owner/number'),
      reactions: z
        .number()
        .optional()
        .describe('Filter on number of reactions'),
      state: z
        .enum(['open', 'closed'])
        .optional()
        .describe('Filter based on issue state'),
      teamMentions: z
        .string()
        .optional()
        .describe('Filter based on team mentions'),
      updated: z.string().optional().describe('Filter on last updated at date'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
      sort: z
        .enum([
          'comments',
          'created',
          'interactions',
          'reactions',
          'reactions-+1',
          'reactions--1',
          'reactions-heart',
          'reactions-smile',
          'reactions-tada',
          'reactions-thinking_face',
          'updated',
          'best-match',
        ])
        .optional()
        .describe('Sort issues by specified criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of issues to return (default: 50)'),
    },
    {
      title: 'Search GitHub Issues',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubIssuesSearchParams) => {
      try {
        const result = await searchGitHubIssues(args);

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
            // If parsing fails, estimate from text
            const lines = responseText.split('\n').filter(line => line.trim());
            resultCount = Math.max(0, lines.length - 5);
          }

          // Add smart suggestions for empty or poor results
          if (resultCount === 0) {
            responseText += `

🔄 NO RESULTS RECOVERY STRATEGY:
• Try broader terms: "${args.query}" → single keywords
• Alternative discovery: github_search_repos for related projects
• Problem context: github_search_code for implementation examples
• Solution tracking: github_search_pull_requests for fixes

💡 QUERY SIMPLIFICATION:
• Remove quotes and special characters
• Use single keywords: "bug", "error", "feature"
• Try related terms: "issue" → "problem", "bug" → "error"

🔗 RECOMMENDED TOOL CHAIN:
1. github_search_repos - Find projects that might have similar issues
2. github_search_code - Search for code patterns related to your problem
3. npm_search_packages - Find packages that solve similar problems`;
          } else if (resultCount <= 5) {
            responseText += `

💡 FEW RESULTS ENHANCEMENT:
• Found ${resultCount} issues - try broader search terms
• Alternative: github_search_repos for project-level discovery
• Cross-reference: github_search_code for implementation patterns`;
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
              text: `Failed to search GitHub issues: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
