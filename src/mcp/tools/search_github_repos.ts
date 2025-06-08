import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubReposSearchParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { searchGitHubRepos } from '../../impl/github';

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

// Validate single term only
function validateSingleTerm(query: string): void {
  const sanitized = sanitizeInput(query);

  // Check for multiple terms (spaces, plus signs, complex operators)
  if (
    /\s+/.test(sanitized) ||
    /\+/.test(sanitized) ||
    /AND|OR|NOT/i.test(sanitized)
  ) {
    throw new Error(
      'This tool only supports single terms. For multi-term searches, use npm_search_packages or github_search_topics first for discovery.'
    );
  }

  // Validate term length
  if (sanitized.length < 2) {
    throw new Error('Search term must be at least 2 characters long');
  }

  if (sanitized.length > 100) {
    throw new Error('Search term must be less than 100 characters');
  }
}

// Validate field combinations
function validateFieldCombinations(args: GitHubReposSearchParams): void {
  // If using specific filters, owner should be provided for scoping
  const hasSpecificFilters =
    args.language || args.topic || args.stars !== undefined;

  if (hasSpecificFilters && !args.owner) {
    console.warn(
      'Warning: Using specific filters without owner may return too many results. Consider providing owner for better scoping.'
    );
  }

  // Validate date formats if provided
  const dateFields = ['created', 'updated'];
  dateFields.forEach(field => {
    const value = args[field as keyof GitHubReposSearchParams] as string;
    if (value && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(
        `${field} must be in format ">2020-01-01", "<2023-12-31", etc.`
      );
    }
  });

  // Validate numeric ranges
  if (args.limit && (args.limit < 1 || args.limit > 100)) {
    throw new Error('Limit must be between 1 and 100');
  }

  if (args.stars !== undefined && args.stars < 0) {
    throw new Error('Stars filter must be non-negative');
  }

  if (args.forks !== undefined && args.forks < 0) {
    throw new Error('Forks filter must be non-negative');
  }
}

export function registerSearchGitHubReposTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES],
    {
      query: z
        .string()
        .describe(
          'Search query for repositories. SINGLE TERMS ONLY - no spaces, no operators like "react hooks". Use "react" OR "hooks" separately.'
        ),
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
    {
      title: 'Search GitHub Repositories',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubReposSearchParams) => {
      try {
        // Ensure query is provided
        if (!args.query) {
          throw new Error('Query is required');
        }

        // Validate single term requirement
        validateSingleTerm(args.query);

        // Validate field combinations
        validateFieldCombinations(args);

        // Sanitize the query
        const sanitizedArgs = {
          ...args,
          query: sanitizeInput(args.query),
        };

        return await searchGitHubRepos(sanitizedArgs);
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
