import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitsSearchParams } from '../../types';
import { searchGitHubCommits } from '../../impl/github/searchGitHubCommits';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
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
          'Search query to find commits. If omitted, returns recent commits.'
        ),
      owner: z.string().optional().describe('Repository owner/organization'),
      repo: z.string().optional().describe('Repository name'),
      author: z.string().optional().describe('Filter by commit author'),
      committer: z.string().optional().describe('Filter by committer'),
      authorDate: z
        .string()
        .optional()
        .describe("Filter by authored date (e.g., '>2022-01-01')"),
      committerDate: z
        .string()
        .optional()
        .describe("Filter by committed date (e.g., '>2022-01-01')"),
      authorEmail: z.string().optional().describe('Filter by author email'),
      authorName: z.string().optional().describe('Filter by author name'),
      committerEmail: z
        .string()
        .optional()
        .describe('Filter by committer email'),
      committerName: z.string().optional().describe('Filter by committer name'),
      merge: z.boolean().optional().describe('Filter merge commits'),
      hash: z.string().optional().describe('Filter by commit hash'),
      parent: z.string().optional().describe('Filter by parent hash'),
      tree: z.string().optional().describe('Filter by tree hash'),
      sort: z
        .enum(['author-date', 'committer-date', 'best-match'])
        .optional()
        .default('best-match')
        .describe('Sort criteria (default: best-match)'),
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
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Repository visibility filter'),
    },
    {
      title: 'Search Commit History for Development Tracking',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_COMMITS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCommitsSearchParams) => {
      try {
        if (args.limit && (args.limit < 1 || args.limit > 100)) {
          return createResult('Limit must be between 1 and 100', true);
        }

        // Validate date formats
        const dateFields = [
          { field: 'authorDate', value: args.authorDate },
          { field: 'committerDate', value: args.committerDate },
        ];

        for (const { field, value } of dateFields) {
          if (value && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(value)) {
            return createResult(
              `${field} must be in format ">2022-01-01", "<2023-12-31", etc.`,
              true
            );
          }
        }

        // If query is undefined or empty, treat as exploratory (recent commits)
        const searchArgs =
          !args.query || args.query.trim() === ''
            ? { ...args, query: undefined }
            : args;

        const result = await searchGitHubCommits(searchArgs);

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed && data.results) {
            return createResult({
              q: args.query,
              results: data.results,
              ...(data.analysis && { analysis: data.analysis }),
            });
          }
        }

        // Handle no results
        const suggestions = generateStandardSuggestions(args.query || '', [
          TOOL_NAMES.GITHUB_SEARCH_COMMITS,
        ]);
        return createResult('No commits found', true, suggestions);
      } catch (error) {
        return createResult(
          `Commit search failed: ${(error as Error).message}`,
          true
        );
      }
    }
  );
}
