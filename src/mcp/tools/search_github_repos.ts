import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubReposSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { SEARCH_GITHUB_REPOS_DESCRIPTION } from './descriptions/searchGitHubRepos';
import { searchGitHubRepos } from '../../impl/github';

export function registerSearchGitHubReposTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_REPOS,
    SEARCH_GITHUB_REPOS_DESCRIPTION,
    {
      query: z.string().describe('Search query for repositories'),
      owner: z.string().describe('Repository owner/organization'),
      archived: z.boolean().optional().describe('Filter archived state'),
      created: z.string().optional().describe('Filter by created date'),
      followers: z.number().optional().describe('Filter by followers count'),
      forks: z.number().optional().describe('Filter by forks count'),
      goodFirstIssues: z
        .number()
        .optional()
        .describe('Filter by good first issues count'),
      helpWantedIssues: z
        .number()
        .optional()
        .describe('Filter by help wanted issues count'),
      includeForks: z
        .enum(['false', 'true', 'only'])
        .optional()
        .describe('Include forks in results'),
      language: z
        .string()
        .optional()
        .describe('Filter by programming language'),
      license: z.string().optional().describe('Filter by license type'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum results (default: 50)'),
      match: z
        .enum(['name', 'description', 'readme'])
        .optional()
        .describe('Search scope restriction'),
      numberTopics: z.number().optional().describe('Filter by topics count'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Result order (default: desc for newest first)'),
      size: z.string().optional().describe('Filter by size in KB'),
      sort: z
        .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
        .optional()
        .default('updated')
        .describe('Sort criteria (default: updated for recent activity)'),
      stars: z.number().optional().describe('Filter by stars count'),
      topic: z.string().optional().describe('Filter by topic/tag'),
      updated: z.string().optional().describe('Filter by last update date'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter by visibility'),
    },
    async (args: GitHubReposSearchParams) => {
      try {
        return await searchGitHubRepos(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub repositories: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
