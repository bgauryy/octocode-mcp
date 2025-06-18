import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubPullRequestsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubPullRequests } from '../../impl/github/searchGitHubPullRequests';
import {
  createResult,
  parseJsonResponse,
  getNoResultsSuggestions,
  getErrorSuggestions,
} from '../../impl/util';

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe('Search query to find pull requests'),
      owner: z.string().optional().describe(`Repository owner/organization`),
      repo: z.string().optional().describe('Repository name'),
      author: z.string().optional().describe('Filter by pull request author'),
      assignee: z.string().optional().describe('Filter by assignee'),
      mentions: z.string().optional().describe('Filter by user mentions'),
      commenter: z.string().optional().describe('Filter by comments by user'),
      involves: z.string().optional().describe('Filter by user involvement'),
      reviewedBy: z.string().optional().describe('Filter by user who reviewed'),
      reviewRequested: z
        .string()
        .optional()
        .describe('Filter by user or team requested to review'),
      state: z.enum(['open', 'closed']).optional().describe('Filter by state'),
      head: z.string().optional().describe('Filter by head branch name'),
      base: z.string().optional().describe('Filter by base branch name'),
      language: z.string().optional().describe('Filter by coding language'),
      created: z
        .string()
        .optional()
        .describe("Filter by created date (e.g., '>2022-01-01')"),
      updated: z.string().optional().describe('Filter by last updated date'),
      mergedAt: z.string().optional().describe('Filter by merged date'),
      closed: z.string().optional().describe('Filter by closed date'),
      draft: z.boolean().optional().describe('Filter by draft state'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe('Maximum results (default: 25)'),
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
        .describe('Sort criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order (default: desc)'),
    },
    {
      title: 'Search Pull Requests for Implementation Analysis',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubPullRequestsSearchParams) => {
      try {
        if (!args.query || args.query.trim().length === 0) {
          return createResult(
            'Search query is required and cannot be empty',
            true
          );
        }

        if (args.query.length > 256) {
          return createResult(
            'Search query is too long. Please limit to 256 characters or less.',
            true
          );
        }

        if (args.limit && (args.limit < 1 || args.limit > 50)) {
          return createResult('Limit must be between 1 and 50', true);
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
            return createResult(
              `${field} must be in format ">2022-01-01", "<2023-12-31", etc.`,
              true
            );
          }
        }

        const result = await searchGitHubPullRequests(args);

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed && data.results) {
            return createResult({
              q: args.query,
              results: data.results,
              ...(data.metadata && { metadata: data.metadata }),
            });
          }
        }

        // Handle no results
        const suggestions = getNoResultsSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
        );
        return createResult('No pull requests found', true, suggestions);
      } catch (error) {
        const suggestions = getErrorSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
        );
        return createResult(
          `PR search failed: ${(error as Error).message}`,
          true,
          suggestions
        );
      }
    }
  );
}
