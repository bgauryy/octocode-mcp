import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubPullRequestsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubPullRequests } from '../../impl/github/searchGitHubPullRequests';
import {
  createSmartError,
  createStandardResponse,
  generateStandardSuggestions,
} from '../../impl/util';

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
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
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe(
          'Maximum number of pull requests to return (default: 25, max: 50 for LLM optimization)'
        ),
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
      description:
        'Search pull requests for implementation analysis and code review insights. Essential for understanding development patterns, finding code examples, and tracking feature implementations.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubPullRequestsSearchParams) => {
      try {
        // Enhanced input validation
        if (!args.query || args.query.trim().length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        if (args.query.length > 256) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is too long. Please limit to 256 characters or less.',
              },
            ],
            isError: true,
          };
        }

        if (args.limit && (args.limit < 1 || args.limit > 50)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Limit must be between 1 and 50',
              },
            ],
            isError: true,
          };
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
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${field} must be in format ">2022-01-01", "<2023-12-31", ">=2022-06-01", etc.`,
                },
              ],
              isError: true,
            };
          }
        }

        const result = await searchGitHubPullRequests(args);

        // Check if we have a successful result with content
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          try {
            const data = JSON.parse(responseText);

            // If we have results, return them directly
            if (data.results) {
              return createStandardResponse({
                query: args.query,
                data: data.results,
                failureSuggestions: data.suggestions,
              });
            }
          } catch (parseError) {
            // If parsing fails, return the raw response
            return createStandardResponse({
              query: args.query,
              data: responseText,
            });
          }
        }

        // If no results or error, generate suggestions
        const suggestions = generateStandardSuggestions(args.query, [
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        ]);

        return createStandardResponse({
          query: args.query,
          data: [],
          failureSuggestions: suggestions,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        return createSmartError(
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          'PR search',
          errorMessage,
          args.query
        );
      }
    }
  );
}
