import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubTopicsSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
  getNoResultsSuggestions,
  getErrorSuggestions,
} from '../../impl/util';
import { searchGitHubTopics } from '../../impl/github/searchGitHubTopics';

const MAX_TOPICS = 30;

export function registerSearchGitHubTopicsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_TOPICS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_TOPICS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe('Search query to find topics'),
      owner: z
        .string()
        .optional()
        .describe(
          'Repository owner/organization. Leave empty for global search - recommended for discovery.'
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
        .describe('Filter by number of repositories using this topic'),
      created: z.string().optional().describe('Filter by topic creation date'),
      sort: z
        .enum(['featured', 'repositories', 'created', 'updated'])
        .optional()
        .describe('Sort topics by specified criteria'),
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
        .default(20)
        .describe('Maximum results (default: 20)'),
    },
    {
      title: 'Discover GitHub Topics for Ecosystem Mapping',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_TOPICS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubTopicsSearchParams) => {
      try {
        const result = await searchGitHubTopics(args);

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed) {
            // Check GitHub API response format with items array
            if (data.results?.items && Array.isArray(data.results.items)) {
              const topTopics = data.results.items.slice(0, MAX_TOPICS);
              return createResult({
                q: args.query,
                results: topTopics,
              });
            }

            // Direct GitHub API response
            if (data.items && Array.isArray(data.items)) {
              const topTopics = data.items.slice(0, MAX_TOPICS);
              return createResult({
                q: args.query,
                results: topTopics,
              });
            }

            // Other formats
            if (data.results) {
              return createResult({
                q: args.query,
                results: data.results,
              });
            }
          }
        }

        // Handle no results
        const suggestions = getNoResultsSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_TOPICS
        );
        return createResult('No topics found', true, suggestions);
      } catch (error) {
        const suggestions = getErrorSuggestions(
          TOOL_NAMES.GITHUB_SEARCH_TOPICS
        );
        return createResult(
          `Failed to search GitHub topics: ${(error as Error).message}`,
          true,
          suggestions
        );
      }
    }
  );
}
