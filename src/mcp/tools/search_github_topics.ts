import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubTopicsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import {
  createStandardResponse,
  generateStandardSuggestions,
} from '../../impl/util';
import { searchGitHubTopics } from '../../impl/github/searchGitHubTopics';

export function registerSearchGitHubTopicsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_TOPICS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_TOPICS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find topics (e.g., 'web-development', 'data-science', 'machine-learning')"
        ),
      owner: z
        .string()
        .optional()
        .describe(
          "Optional: Filter by repository owner/organization (e.g., 'facebook', 'microsoft'). Leave empty for global exploratory search - recommended for discovery."
        ),
      featured: z
        .boolean()
        .optional()
        .describe('Filter for featured topics curated by GitHub'),
      curated: z
        .boolean()
        .optional()
        .describe('Filter for topics curated by the GitHub community'),
      repositories: z
        .string()
        .optional()
        .describe(
          "Filter by number of repositories using this topic (e.g., '>1000', '<500')"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on topic creation date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      sort: z
        .enum(['featured', 'repositories', 'created', 'updated'])
        .optional()
        .describe('Sort topics by specified criteria (default: best-match)'),
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
        .default(20)
        .describe(
          'Maximum number of topics to return (default: 20, max: 50 for LLM optimization)'
        ),
    },
    {
      title: 'Search GitHub Topics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubTopicsSearchParams) => {
      try {
        const result = await searchGitHubTopics(args);

        // Check if we have a successful result with content
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          try {
            const data = JSON.parse(responseText);

            // If we have results, return them directly
            if (data.results) {
              return createStandardResponse({
                searchType: SEARCH_TYPES.TOPICS,
                query: args.query,
                data: data.results,
                failureSuggestions: data.suggestions,
              });
            }
          } catch (parseError) {
            // If parsing fails, return the raw response
            return createStandardResponse({
              searchType: SEARCH_TYPES.TOPICS,
              query: args.query,
              data: responseText,
            });
          }
        }

        // If no results or error, generate suggestions
        const suggestions = generateStandardSuggestions(args.query, [
          TOOL_NAMES.GITHUB_SEARCH_TOPICS,
        ]);

        return createStandardResponse({
          searchType: SEARCH_TYPES.TOPICS,
          query: args.query,
          data: [],
          failureSuggestions: suggestions,
        });
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub topics: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
