import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
  getNoResultsSuggestions,
  getErrorSuggestions,
} from '../../impl/util';
import { searchGitHubIssues } from '../../impl/github/searchGitHubIssues';

export function registerSearchGitHubIssuesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_ISSUES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_ISSUES],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe('Search query to find issues'),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Repository owner/organization. Leave empty for global search.'
        ),
      repo: z
        .string()
        .optional()
        .describe(
          'Repository name. Do exploratory search without repo filter first'
        ),
      app: z.string().optional().describe('Filter by GitHub App author'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter by repository archived state'),
      assignee: z.string().optional().describe('Filter by assignee'),
      author: z.string().optional().describe('Filter by issue author'),
      closed: z.string().optional().describe('Filter by closed date'),
      commenter: z.string().optional().describe('Filter by user who commented'),
      comments: z.number().optional().describe('Filter by number of comments'),
      created: z
        .string()
        .optional()
        .describe("Filter by created date (e.g., '>2022-01-01')"),
      includePrs: z
        .boolean()
        .optional()
        .describe('Include pull requests in results'),
      interactions: z
        .number()
        .optional()
        .describe('Filter by reactions and comments count'),
      involves: z.string().optional().describe('Filter by user involvement'),
      labels: z.string().optional().describe('Filter by labels'),
      language: z.string().optional().describe('Filter by coding language'),
      locked: z
        .boolean()
        .optional()
        .describe('Filter by locked conversation status'),
      match: z
        .enum(['title', 'body', 'comments'])
        .optional()
        .describe('Restrict search to specific field'),
      mentions: z.string().optional().describe('Filter by user mentions'),
      milestone: z.string().optional().describe('Filter by milestone title'),
      noAssignee: z.boolean().optional().describe('Filter by missing assignee'),
      noLabel: z.boolean().optional().describe('Filter by missing label'),
      noMilestone: z
        .boolean()
        .optional()
        .describe('Filter by missing milestone'),
      noProject: z.boolean().optional().describe('Filter by missing project'),
      project: z.string().optional().describe('Filter by project board'),
      reactions: z.number().optional().describe('Filter by reactions count'),
      state: z
        .enum(['open', 'closed'])
        .optional()
        .describe('Filter by issue state'),
      teamMentions: z.string().optional().describe('Filter by team mentions'),
      updated: z.string().optional().describe('Filter by last updated date'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter by repository visibility'),
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
        .describe('Sort criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order (default: desc)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe('Maximum results (default: 25)'),
    },
    {
      title: 'Search Issues for Problem Discovery and Solutions',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_ISSUES],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubIssuesSearchParams) => {
      // Input validation
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

      try {
        const result = await searchGitHubIssues(args);

        if (result.isError) {
          return createResult(result.content[0].text, true);
        }

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed) {
            // Handle different possible response formats
            if (data.results && Array.isArray(data.results)) {
              return createResult({
                q: args.query,
                results: data.results,
                ...(data.metadata && { metadata: data.metadata }),
              });
            }

            // Handle case where no results found but valid response
            if (data.metadata && data.metadata.total_count === 0) {
              const suggestions = getNoResultsSuggestions(
                TOOL_NAMES.GITHUB_SEARCH_ISSUES
              );
              return createResult('No issues found', true, suggestions);
            }
          }
        }

        // Handle no results or parsing failure
        const suggestions = getNoResultsSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_ISSUES
        );
        return createResult('No issues found', true, suggestions);
      } catch (error) {
        const suggestions = getErrorSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_ISSUES
        );
        return createResult(
          `Failed to search GitHub issues: ${(error as Error).message}`,
          true,
          suggestions
        );
      }
    }
  );
}
