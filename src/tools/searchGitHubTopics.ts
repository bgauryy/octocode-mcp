import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubTopicsSearchParams } from '../types';
import { TOOL_NAMES } from './contstants';
import { searchGitHubTopics } from '../impl';
import { SEARCH_GITHUB_TOPICS_DESCRIPTION } from '../prompts/searchGitHubTopics';

export function registerSearchGitHubTopicsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_TOPICS,
    SEARCH_GITHUB_TOPICS_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search query to find topics (e.g., 'machine learning', 'react', 'devops', 'blockchain')"
        ),
      owner: z
        .string()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org') obtained from the appropriate tool for fetching user organizations"
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
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of topics to return (default: 50)'),
      sort: z
        .enum(['featured', 'repositories', 'created', 'updated'])
        .optional()
        .describe('Sort topics by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
    },
    async (args: GitHubTopicsSearchParams) => {
      try {
        return await searchGitHubTopics(args);
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
