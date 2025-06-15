import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubTopicsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubTopics } from '../../impl/github/searchGitHubTopics';

export function registerSearchGitHubTopicsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_TOPICS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_TOPICS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find topics (e.g., 'web-development', 'data-science', 'machine-learning')"
        ),
      owner: z
        .string()
        .optional()
        .describe(
          "Optional: Filter by repository owner/organization (e.g., 'facebook', 'microsoft'). Leave empty for global exploratory search - recommended for discovery."
        ),
      featured: z
        .boolean()
        .optional()
        .describe('Filter for featured topics curated by GitHub'),
      curated: z
        .boolean()
        .optional()
        .describe('Filter for topics curated by the GitHub community'),
      repositories: z
        .string()
        .optional()
        .describe(
          "Filter by number of repositories using this topic (e.g., '>1000', '<500')"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on topic creation date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      sort: z
        .enum(['featured', 'repositories', 'created', 'updated'])
        .optional()
        .describe('Sort topics by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of topics to return (default: 50)'),
    },
    {
      title: 'Search GitHub Topics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubTopicsSearchParams) => {
      try {
        const result = await searchGitHubTopics(args);

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

NO TOPICS FOUND RECOVERY:
• Try simpler terms: "${args.query}" → single technology keywords
• Ecosystem discovery: npm_search_packages for related packages
• Repository search: github_search_repos for projects using these topics
• User community: github_search_users for topic experts

TOPIC SEARCH OPTIMIZATION:
• Use popular technology terms: "react", "javascript", "python"
• Try compound topics: "machine-learning", "web-development"
• Focus on featured topics: featured=true

🔗 RECOMMENDED DISCOVERY CHAIN:
1. npm_search_packages - Find packages in this domain
2. github_search_repos - Discover projects using these topics
3. github_search_code - Find implementations using topic technologies`;
          } else if (resultCount <= 3) {
            responseText += `

LIMITED TOPICS ENHANCEMENT:
• Found ${resultCount} topics - try broader or more popular terms
• Ecosystem expansion: npm_search_packages for related technologies
• Project discovery: github_search_repos for topic implementation`;
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
              text: `Failed to search GitHub topics: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
