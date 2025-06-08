import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubPullRequestsSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { searchGitHubPullRequests } from '../../impl/github';

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
    {
      query: z
        .string()
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
        return await searchGitHubPullRequests(args);
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
