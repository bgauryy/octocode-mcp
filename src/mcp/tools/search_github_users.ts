import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubUsersSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { searchGitHubUsers } from '../../impl/github/searchGitHubUsers';
import {
  createSmartError,
  createStandardResponse,
  generateStandardSuggestions,
} from '../../impl/util';

export function registerSearchGitHubUsersTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_USERS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_USERS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find users/organizations (e.g., 'software developer', 'programming', 'machine learning')"
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org'). OPTIONAL: Leave empty for global searches across all of GitHub."
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
          "Filter by primary programming language (e.g., 'python', 'rust', 'go')"
        ),
      repos: z
        .string()
        .optional()
        .describe(
          "Filter by repository count (e.g., '>10', '>50' for active contributors)"
        ),
      followers: z
        .string()
        .optional()
        .describe(
          "Filter by follower count (e.g., '>100', '>1000' for influential users)"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on account creation date (e.g., '>2020-01-01', '<2023-12-31')"
        ),
      sort: z
        .enum(['followers', 'repositories', 'joined'])
        .optional()
        .describe('Sort users by specified criteria (default: best-match)'),
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
          'Maximum number of users to return (default: 25, max: 50 for LLM optimization)'
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe('The page number of the results to fetch (default: 1)'),
    },
    {
      title: 'Search GitHub Users',
      description:
        'Find developers, experts, and community leaders across GitHub. Essential for discovering contributors, finding expertise, and building professional networks within specific technology ecosystems.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubUsersSearchParams) => {
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

        if (args.page && args.page < 1) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Page number must be 1 or greater',
              },
            ],
            isError: true,
          };
        }

        // Validate numeric filters
        const numericFilters = [
          { field: 'repos', value: args.repos },
          { field: 'followers', value: args.followers },
        ];

        for (const { field, value } of numericFilters) {
          if (value && !/^[><]=?\d+$/.test(value)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${field} filter must be in format ">10", ">=50", "<1000", etc.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Validate date format
        if (args.created && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(args.created)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: created date must be in format ">2020-01-01", "<2023-12-31", etc.',
              },
            ],
            isError: true,
          };
        }

        const result = await searchGitHubUsers(args);

        // Check if we have a successful result with content
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          try {
            const data = JSON.parse(responseText);

            // If we have results, return them directly
            if (data.results) {
              return createStandardResponse({
                searchType: SEARCH_TYPES.USERS,
                query: args.query,
                data: data.results,
                failureSuggestions: data.suggestions,
              });
            }
          } catch (parseError) {
            // If parsing fails, return the raw response
            return createStandardResponse({
              searchType: SEARCH_TYPES.USERS,
              query: args.query,
              data: responseText,
            });
          }
        }

        // If no results or error, generate suggestions
        const suggestions = generateStandardSuggestions(args.query, [
          TOOL_NAMES.GITHUB_SEARCH_USERS,
        ]);

        return createStandardResponse({
          searchType: SEARCH_TYPES.USERS,
          query: args.query,
          data: [],
          failureSuggestions: suggestions,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        return createSmartError(
          TOOL_NAMES.GITHUB_SEARCH_USERS,
          'User search',
          errorMessage,
          args.query
        );
      }
    }
  );
}
