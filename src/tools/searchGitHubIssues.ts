import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../types';
import { TOOL_NAMES } from './contstants';
import { searchGitHubIssues } from '../impl';
import { SEARCH_GITHUB_ISSUES_DESCRIPTION } from '../prompts/searchGitHubIssues';

export function registerSearchGitHubIssuesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_ISSUES,
    SEARCH_GITHUB_ISSUES_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search query to find issues (e.g., 'bug fix', 'feature request', 'documentation')"
        ),
      owner: z
        .string()
        .describe(
          "Filter by repository owner/organization (e.g., 'wix-private') get from get_user_organizations tool"
        ),
      repo: z
        .string()
        .optional()
        .describe(
          "Filter by specific repository name (e.g., 'cli/cli'). Note: Always do exploratory search without repo filter first"
        ),
      author: z.string().optional().describe('Filter by issue author'),
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
      state: z
        .enum(['open', 'closed'])
        .optional()
        .describe('Filter based on issue state'),
      labels: z
        .string()
        .optional()
        .describe(
          "Filter by labels (e.g., 'bug', 'enhancement', 'documentation')"
        ),
      milestone: z.string().optional().describe('Filter by milestone'),
      project: z.string().optional().describe('Filter by project'),
      language: z
        .string()
        .optional()
        .describe('Filter based on the coding language'),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on created date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      updated: z.string().optional().describe('Filter on last updated date'),
      closed: z.string().optional().describe('Filter on closed date'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of issues to return (default: 50)'),
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
        .describe('Sort issues by specified criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
    },
    async (args: GitHubIssuesSearchParams) => {
      try {
        return await searchGitHubIssues(args);
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
