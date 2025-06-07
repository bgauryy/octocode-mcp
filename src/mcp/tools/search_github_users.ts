import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubUsersSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { SEARCH_GITHUB_USERS_DESCRIPTION } from './descriptions/searchGitHubUsers';
import { searchGitHubUsers } from '../../impl/github';

export function registerSearchGitHubUsersTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_USERS,
    SEARCH_GITHUB_USERS_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search query to find users/organizations (e.g., 'react developer', 'python', 'machine learning')"
        ),
      owner: z
        .string()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org') obtained from the appropriate tool for fetching user organizations"
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
      followers: z
        .string()
        .optional()
        .describe(
          "Filter by follower count (e.g., '>100', '>1000' for influential users)"
        ),
      repos: z
        .string()
        .optional()
        .describe(
          "Filter by repository count (e.g., '>10', '>50' for active contributors)"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on account creation date (e.g., '>2020-01-01', '<2023-12-31')"
        ),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of users to return (default: 50)'),
      sort: z
        .enum(['followers', 'repositories', 'joined'])
        .optional()
        .describe('Sort users by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
    },
    async (args: GitHubUsersSearchParams) => {
      try {
        return await searchGitHubUsers(args);
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
