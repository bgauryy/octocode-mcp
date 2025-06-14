import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubUsersSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubUsers } from '../../impl/github/searchGitHubUsers';

export function registerSearchGitHubUsersTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_USERS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_USERS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find users/organizations (e.g., 'react developer', 'python', 'machine learning')"
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org'). OPTIONAL: Leave empty for global searches across all of GitHub."
        ),
      type: z
        .enum(['user', 'org'])
        .optional()
        .describe(
          'Filter by account type (user for individuals, org for organizations)'
        ),
      location: z
        .string()
        .optional()
        .describe(
          "Filter by location (e.g., 'San Francisco', 'London', 'Remote')"
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Filter by primary programming language (e.g., 'javascript', 'python', 'java')"
        ),
      repos: z
        .string()
        .optional()
        .describe(
          "Filter by repository count (e.g., '>10', '>50' for active contributors)"
        ),
      followers: z
        .string()
        .optional()
        .describe(
          "Filter by follower count (e.g., '>100', '>1000' for influential users)"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on account creation date (e.g., '>2020-01-01', '<2023-12-31')"
        ),
      sort: z
        .enum(['followers', 'repositories', 'joined'])
        .optional()
        .describe('Sort users by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of users to return (default: 50)'),
      page: z
        .number()
        .optional()
        .default(1)
        .describe('The page number of the results to fetch (default: 1)'),
    },
    {
      title: 'Search GitHub Users',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubUsersSearchParams) => {
      try {
        const result = await searchGitHubUsers(args);

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
• Try simpler terms: "${args.query}" → technology keywords only
• Organization discovery: github_get_user_organizations for company access
• Project-based search: github_search_repos to find user projects
• Code contribution search: github_search_code for user activity

💡 USER SEARCH OPTIMIZATION:
• Use technology terms: "react", "python", "javascript"
• Try location filters: location="San Francisco", location="Remote"
• Focus on active users: followers>10, repos>5

🔗 RECOMMENDED TOOL CHAIN:
1. github_search_repos - Find projects by technology/topic
2. github_get_user_organizations - Discover organizations
3. npm_search_packages - Find package maintainers`;
          } else if (resultCount <= 5) {
            responseText += `

💡 FEW RESULTS ENHANCEMENT:
• Found ${resultCount} users - try broader location or technology terms
• Alternative: github_search_repos for project discovery
• Organization search: github_get_user_organizations`;
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
              text: `Failed to search GitHub users: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
