import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createStandardResponse,
  generateStandardSuggestions,
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
        .describe(
          "The search query to find issues (e.g., 'bug fix', 'feature request', 'documentation')"
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org'). OPTIONAL: Leave empty for global searches across all of GitHub."
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
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe(
          'Maximum number of issues to return (default: 25, max: 50 for LLM optimization)'
        ),
    },
    {
      title: 'Search GitHub Issues',
      description:
        'Search for GitHub issues across repositories with advanced filtering options. Returns structured results with search metadata and suggestions for empty results.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubIssuesSearchParams) => {
      // Input validation
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

      // Validate query length to prevent API issues
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

      try {
        const result = await searchGitHubIssues(args);

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
          TOOL_NAMES.GITHUB_SEARCH_ISSUES,
        ]);

        return createStandardResponse({
          query: args.query,
          data: [],
          failureSuggestions: suggestions,
        });
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
