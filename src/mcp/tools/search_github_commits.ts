import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitsSearchParams } from '../../types';
import { searchGitHubCommits } from '../../impl/github/searchGitHubCommits';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import {
  createSmartError,
  createStandardResponse,
  generateStandardSuggestions,
} from '../../impl/util';

export function registerSearchGitHubCommitsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_COMMITS],
    {
      query: z
        .string()
        .optional()
        .describe(
          "The search query to find commits - start with a keyword (e.g., 'bug', 'refactor', 'feature'). If omitted, will return the most recent commits (exploratory mode)."
        ),
      owner: z
        .string()
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org') obtained from the appropriate tool for fetching user organizations"
        ),
      repo: z
        .string()
        .optional()
        .describe("Filter by repository name (e.g., 'cli/cli')"),
      author: z.string().optional().describe('Filter by commit author'),
      committer: z.string().optional().describe('Filter by committer'),
      authorDate: z
        .string()
        .optional()
        .describe(
          "Filter based on authored date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      committerDate: z
        .string()
        .optional()
        .describe(
          "Filter based on committed date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      authorEmail: z.string().optional().describe('Filter on author email'),
      authorName: z.string().optional().describe('Filter on author name'),
      committerEmail: z
        .string()
        .optional()
        .describe('Filter on committer email'),
      committerName: z.string().optional().describe('Filter on committer name'),
      merge: z.boolean().optional().describe('Filter on merge commits'),
      hash: z.string().optional().describe('Filter by commit hash'),
      parent: z.string().optional().describe('Filter by parent hash'),
      tree: z.string().optional().describe('Filter by tree hash'),
      sort: z
        .enum(['author-date', 'committer-date', 'best-match'])
        .optional()
        .default('best-match')
        .describe('Sort commits by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of commits returned (default: desc for newest first)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe(
          'Maximum number of commits to return (default: 25, max: 50 for LLM optimization)'
        ),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
    },
    {
      title: 'Search GitHub Commits',
      description:
        'Search commit history for development tracking and code evolution with comprehensive filtering options. Essential for understanding project development patterns and finding specific changes.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCommitsSearchParams) => {
      try {
        // Enhanced input validation
        if (args.limit && (args.limit < 1 || args.limit > 100)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Limit must be between 1 and 100',
              },
            ],
            isError: true,
          };
        }

        // Validate date formats
        const dateFields = [
          { field: 'authorDate', value: args.authorDate },
          { field: 'committerDate', value: args.committerDate },
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

        // If query is undefined or empty, treat as exploratory (recent commits)
        const searchArgs =
          !args.query || args.query.trim() === ''
            ? { ...args, query: undefined }
            : args;

        const result = await searchGitHubCommits(searchArgs);

        // Check if we have a successful result with content
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          try {
            const data = JSON.parse(responseText);

            // If we have results, return them directly
            if (data.results) {
              return createStandardResponse({
                searchType: SEARCH_TYPES.COMMITS,
                query: args.query,
                data: data.results,
                failureSuggestions: data.suggestions,
              });
            }
          } catch (parseError) {
            // If parsing fails, return the raw response
            return createStandardResponse({
              searchType: SEARCH_TYPES.COMMITS,
              query: args.query,
              data: responseText,
            });
          }
        }

        // If no results or error, generate suggestions
        const suggestions = generateStandardSuggestions(args.query || '', [
          TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        ]);

        return createStandardResponse({
          searchType: SEARCH_TYPES.COMMITS,
          query: args.query,
          data: [],
          failureSuggestions: suggestions,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        return createSmartError(
          TOOL_NAMES.GITHUB_SEARCH_COMMITS,
          'Commit search',
          errorMessage,
          args.query
        );
      }
    }
  );
}
