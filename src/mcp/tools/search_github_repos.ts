import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubReposSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { searchGitHubRepos } from '../../impl/github/searchGitHubRepos';
import {
  detectOrganizationalQuery,
  createSmartError,
  createStandardResponse,
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

// Smart query decomposition for multi-term queries
function decomposeQuery(query: string): {
  primaryTerm: string;
  suggestion: string;
  shouldDecompose: boolean;
} {
  const sanitized = sanitizeInput(query);

  // Check for multi-term patterns
  const hasMultipleTerms =
    /\s+/.test(sanitized) ||
    /\+/.test(sanitized) ||
    /AND|OR|NOT/i.test(sanitized);

  if (!hasMultipleTerms) {
    return { primaryTerm: sanitized, suggestion: '', shouldDecompose: false };
  }

  // Extract primary term (first meaningful word)
  const terms = sanitized.split(/[\s+]/).filter(term => term.length >= 2);
  const primaryTerm = terms[0] || sanitized;

  // Create suggestion for better workflow
  const suggestion =
    terms.length > 1
      ? `Multi-term query detected. Recommended workflow:
1. Start with primary term: "${primaryTerm}"
2. Use ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for "${terms.join(' ')}" package discovery
3. Use ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for ecosystem terminology: "${terms.join('+')}"
4. Apply additional terms as filters once repositories are discovered`
      : '';

  return { primaryTerm, suggestion, shouldDecompose: true };
}

export function registerSearchGitHubReposTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_REPOS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          'Search query for repositories. PRODUCTION TIP: Single terms work best (e.g., "react", "typescript"). Multi-term queries will be auto-decomposed with suggestions.'
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Repository owner/organization (e.g., "facebook", "microsoft"). OPTIONAL: Leave empty for global searches across all of GitHub. Recommended for scoped, reliable results.'
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
        .describe(
          'Filter by programming language - WARNING: Can cause empty results with restrictive combinations'
        ),
      license: z
        .array(z.string())
        .optional()
        .describe('Filter based on license type (e.g., ["mit", "apache-2.0"])'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe(
          'Maximum results (default: 25, max: 50 for LLM optimization)'
        ),
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
        .describe('Result order (default: desc for newest first)'),
      size: z
        .string()
        .optional()
        .describe(
          'Filter on size range, in kilobytes (e.g., ">1000", "50..120")'
        ),
      sort: z
        .enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match'])
        .optional()
        .default('best-match')
        .describe('Sort fetched repositories (default: best-match)'),
      stars: z
        .string()
        .optional()
        .describe(
          'Filter by stars count (e.g., ">100", "<1000", ">=500", "50..200" for range queries) - TIP: Use >100 for established projects, >10 for active ones'
        ),
      topic: z
        .array(z.string())
        .optional()
        .describe('Filter on topic (e.g., ["react", "javascript"])'),
      updated: z.string().optional().describe('Filter by last update date'),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
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
        if (!args.query || args.query.trim() === '') {
          throw new Error('Query is required and cannot be empty');
        }

        // Smart organizational detection
        const orgInfo = detectOrganizationalQuery(args.query);
        const smartArgs = { ...args };

        // Auto-set owner for organizational queries if not provided
        if (orgInfo.needsOrgAccess && !args.owner && orgInfo.orgName) {
          smartArgs.owner = orgInfo.orgName;
        }

        // Smart query analysis and decomposition
        const queryAnalysis = decomposeQuery(args.query);

        // Prepare the search with potentially decomposed query
        const searchArgs = {
          ...smartArgs,
          query: sanitizeInput(queryAnalysis.primaryTerm),
        };

        // Execute the search
        const result = await searchGitHubRepos(searchArgs);

        // Check if we got results and provide helpful guidance
        const resultText = result.content[0].text as string;
        const resultCount = 0;

        try {
          const parsedResults = JSON.parse(resultText);
          const suggestions =
            resultCount === 0
              ? generateStandardSuggestions(args.query, [
                  TOOL_NAMES.GITHUB_SEARCH_REPOS,
                ])
              : [];

          return createStandardResponse({
            searchType: SEARCH_TYPES.REPOSITORIES,
            query: args.query,
            data: parsedResults,
            totalResults: resultCount,
            failureSuggestions: suggestions,
          });
        } catch (parseError) {
          // If JSON parsing fails, check for error indicators
          if (
            resultText.includes('Failed to') ||
            resultText.includes('Error:') ||
            resultText.includes('fatal:')
          ) {
            throw new Error(`GitHub CLI error: ${resultText}`);
          }

          // Return as-is if we can't parse but it's not an error
          const suggestions = generateStandardSuggestions(args.query, [
            TOOL_NAMES.GITHUB_SEARCH_REPOS,
          ]);

          return createStandardResponse({
            searchType: SEARCH_TYPES.REPOSITORIES,
            query: args.query,
            data: resultText,
            failureSuggestions: suggestions,
          });
        }
      } catch (error) {
        return createSmartError(
          TOOL_NAMES.GITHUB_SEARCH_REPOS,
          'Repository search',
          (error as Error).message,
          args.query
        );
      }
    }
  );
}
