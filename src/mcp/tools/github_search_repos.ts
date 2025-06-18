import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubReposSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubRepos } from '../../impl/github/searchGitHubRepos';
import {
  detectOrganizationalQuery,
  createResult,
  parseJsonResponse,
  generateStandardSuggestions,
} from '../../impl/util';

// Security validation function
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[<>'"&]/g, '') // Remove HTML/XML chars
    .replace(/[;|&$`\\]/g, '') // Remove shell injection chars
    .trim();

  if (sanitized.length === 0) {
    throw new Error('Input cannot be empty after sanitization');
  }

  return sanitized;
}

export function registerSearchGitHubReposTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_REPOS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe('Search query for repositories. Single terms work best.'),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Repository owner/organization. Leave empty for global search.'
        ),
      archived: z.boolean().optional().describe('Filter archived state'),
      created: z
        .string()
        .optional()
        .describe('Filter by created date (format: >2020-01-01, <2023-12-31)'),
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
      license: z
        .array(z.string())
        .optional()
        .describe('Filter based on license type'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe('Maximum results (default: 25, max: 50)'),
      match: z
        .enum(['name', 'description', 'readme'])
        .optional()
        .describe('Search scope restriction'),
      numberTopics: z
        .number()
        .optional()
        .describe('Filter on number of topics'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Result order (default: desc)'),
      size: z.string().optional().describe('Filter on size range in KB'),
      sort: z
        .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
        .optional()
        .default('best-match')
        .describe('Sort criteria (default: best-match)'),
      stars: z
        .string()
        .optional()
        .describe('Filter by stars count. Use >100 for established projects.'),
      topic: z.array(z.string()).optional().describe('Filter on topic'),
      updated: z.string().optional().describe('Filter by last update date'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
    },
    {
      title: 'Search Repositories Across Domains',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubReposSearchParams) => {
      try {
        if (!args.query || args.query.trim() === '') {
          return createResult('Query is required and cannot be empty', true);
        }

        // Smart organizational detection
        const orgInfo = detectOrganizationalQuery(args.query);
        const smartArgs = { ...args };

        // Auto-set owner for organizational queries if not provided
        if (orgInfo.needsOrgAccess && !args.owner && orgInfo.orgName) {
          smartArgs.owner = orgInfo.orgName;
        }

        // Sanitize and prepare search
        const searchArgs = {
          ...smartArgs,
          query: sanitizeInput(args.query),
        };

        const result = await searchGitHubRepos(searchArgs);
        const { data, parsed } = parseJsonResponse(
          result.content[0].text as string
        );

        if (parsed && data.topRepositories?.length > 0) {
          return createResult({
            q: args.query,
            total: data.total,
            results: data.topRepositories,
          });
        }

        // Handle no results
        const suggestions = generateStandardSuggestions(args.query, [
          TOOL_NAMES.GITHUB_SEARCH_REPOS,
        ]);
        return createResult('No repositories found', true, suggestions);
      } catch (error) {
        return createResult(
          `Repository search failed: ${(error as Error).message}`,
          true
        );
      }
    }
  );
}
