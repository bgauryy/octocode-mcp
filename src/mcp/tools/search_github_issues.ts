import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { SEARCH_GITHUB_ISSUES_DESCRIPTION } from './descriptions/searchGitHubIssues';
import { searchGitHubIssues } from '../../impl/github';

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
          "Filter by repository owner/organization (e.g., 'example-org')"
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
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of issues to return (default: 50)'),
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
