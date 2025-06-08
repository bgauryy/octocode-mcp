import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitsSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { searchGitHubCommits } from '../../impl/github';
import { SEARCH_GITHUB_COMMITS_DESCRIPTION } from '../systemPrompts/tools';

export function registerSearchGitHubCommitsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_COMMITS,
    SEARCH_GITHUB_COMMITS_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search query to find commits - start with single keyword (e.g., 'bug', 'refactor', 'feature'). Cannot be empty as GitHub requires search text for commit searches."
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
        .optional()
        .default(50)
        .describe('Maximum number of commits to return (default: 50)'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
    },
    {
      title: 'Search GitHub Commits',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCommitsSearchParams) => {
      try {
        return await searchGitHubCommits(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub commits: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
