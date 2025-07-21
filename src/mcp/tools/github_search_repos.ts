import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult, toDDMMYYYY } from '../responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  createNoResultsError,
  createSearchFailedError,
} from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { GitHubReposSearchBuilder } from './utils/GitHubCommandBuilder';

export const GITHUB_SEARCH_REPOSITORIES_TOOL_NAME = 'githubSearchRepositories';

const DESCRIPTION = `Search GitHub repositories using GitHub CLI.

BULK QUERY MODE:
- queries: array of up to 5 different search queries for parallel execution
- Each query can have fallbackParams for automatic retry with modified parameters
- Optimizes research workflow by executing multiple searches simultaneously
- Fallback logic automatically broadens search if no results found

Use for comprehensive research - query different repos, languages, or approaches in one call.`;

// Define the repository search query schema for bulk operations
const GitHubReposSearchQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  exactQuery: z.string().optional().describe('Single exact phrase/word search'),
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Multiple search terms for broader coverage'),

  // CORE FILTERS (GitHub CLI flags) - Allow null values
  owner: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe(
      'Repository owner/organization name(s). Search within specific organizations or users.'
    ),
  language: z
    .union([z.string(), z.null()])
    .optional()
    .describe(
      'Programming language filter. Filters repositories by primary language.'
    ),
  stars: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Star count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
    ),
  topic: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Find repositories by technology/subject'),
  forks: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Fork count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
    ),

  // Match CLI parameter name exactly
  'number-topics': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Number of topics filter. Format: ">5" (many topics), ">=3" (at least 3), "<10" (few topics), "1..3" (range), "5" (exact).'
    ),

  // QUALITY & STATE FILTERS
  license: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('License filter. Filter repositories by license type.'),
  archived: z
    .union([z.boolean(), z.null()])
    .optional()
    .describe(
      'Archive status filter. false (active repos only), true (archived repos only).'
    ),
  'include-forks': z
    .union([z.enum(['false', 'true', 'only']), z.null()])
    .optional()
    .describe(
      'Fork inclusion. "false" (exclude forks), "true" (include forks), "only" (forks only).'
    ),
  visibility: z
    .union([z.enum(['public', 'private', 'internal']), z.null()])
    .optional()
    .describe('Repository visibility.'),

  // DATE & SIZE FILTERS
  created: z
    .union([
      z
        .string()
        .regex(
          /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
        ),
      z.null(),
    ])
    .optional()
    .describe(
      'Repository creation date filter. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "<=2023-12-31" (on or before), "2020-01-01..2023-12-31" (range), "2023-01-01" (exact).'
    ),
  updated: z
    .union([
      z
        .string()
        .regex(
          /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
        ),
      z.null(),
    ])
    .optional()
    .describe(
      'Last updated date filter. Format: ">2024-01-01" (recently updated), ">=2024-01-01" (on or after), "<2022-01-01" (not recently updated), "2023-01-01..2024-12-31" (range).'
    ),
  size: z
    .union([z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/), z.null()])
    .optional()
    .describe(
      'Repository size filter in KB. Format: ">1000" (large projects), ">=500" (medium-large), "<100" (small projects), "<=50" (tiny), "100..1000" (medium range), "500" (exact).'
    ),

  // COMMUNITY FILTERS - Match CLI parameter names exactly
  'good-first-issues': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Good first issues count. Format: ">5" (many beginner issues), "1..10" (some beginner issues).'
    ),
  'help-wanted-issues': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Help wanted issues count. Format: ">10" (many help wanted), "1..5" (some help wanted).'
    ),
  followers: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Repository owner followers count. Format: ">1000" (popular developers), ">=500" (established developers), "<100" (smaller developers), "100..1000" (range).'
    ),

  // SEARCH SCOPE - Match CLI exactly
  match: z
    .union([
      z.enum(['name', 'description', 'readme']),
      z.array(z.enum(['name', 'description', 'readme'])),
      z.null(),
    ])
    .optional()
    .describe(
      'Search scope. Where to search: name, description, or readme content.'
    ),

  // SORTING & LIMITS - Match CLI defaults exactly
  sort: z
    .union([
      z.enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match']),
      z.null(),
    ])
    .optional()
    .describe('Sort criteria.'),
  order: z
    .union([z.enum(['asc', 'desc']), z.null()])
    .optional()
    .describe('Sort order direction.'),
  limit: z
    .union([z.number().int().min(1).max(100), z.null()])
    .optional()
    .describe('Maximum number of repositories to return (1-100).'),

  // Simplified fallback parameters
  fallbackParams: z
    .record(z.any())
    .optional()
    .describe(
      'Fallback parameters if original query returns no results, overrides the original query and try again'
    ),
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchQuerySchema
>;

export interface GitHubReposSearchQueryResult {
  queryId: string;
  originalQuery: GitHubReposSearchQuery;
  result: any; // Repository search result
  fallbackTriggered: boolean;
  fallbackQuery?: any; // More flexible fallback query type
  error?: string;
}

export function registerSearchGitHubReposTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubReposSearchQuerySchema)
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different search queries for parallel execution'
          ),
      },
      annotations: {
        title: 'GitHub Repository Search - Bulk Queries Only (Optimized)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubReposSearchQuery[];
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubRepos(args.queries);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return createResult({
            error: `Failed to search repositories: ${errorMessage}. Try broader search terms or check repository access.`,
          });
        }
      }
    )
  );
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[]
): Promise<CallToolResult> {
  const results: GitHubReposSearchQueryResult[] = [];

  // Execute queries sequentially to avoid rate limits
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    try {
      // Validate single query
      const hasExactQuery = !!query.exactQuery;
      const hasQueryTerms = query.queryTerms && query.queryTerms.length > 0;

      if (hasExactQuery && hasQueryTerms) {
        results.push({
          queryId,
          originalQuery: query,
          result: { total_count: 0, repositories: [] },
          fallbackTriggered: false,
          error: `Query ${queryId}: Use either exactQuery OR queryTerms, not both`,
        });
        continue;
      }

      // Enhanced validation logic for primary filters
      const hasPrimaryFilter =
        query.exactQuery?.trim() ||
        (query.queryTerms && query.queryTerms.length > 0) ||
        query.owner ||
        query.language ||
        query.topic ||
        query.stars ||
        query.forks;

      if (!hasPrimaryFilter) {
        results.push({
          queryId,
          originalQuery: query,
          result: { total_count: 0, repositories: [] },
          fallbackTriggered: false,
          error: `Query ${queryId}: At least one search parameter required (exactQuery, queryTerms, owner, language, topic, stars, or forks)`,
        });
        continue;
      }

      // Use query parameters directly without modification, filter out null values
      const enhancedQuery: GitHubReposSearchParams = Object.fromEntries(
        Object.entries(query).filter(
          ([_, value]) => value !== null && value !== undefined
        )
      ) as GitHubReposSearchParams;

      // Try original query first
      const result = await searchGitHubRepos(enhancedQuery);

      if (!result.isError) {
        // Success with original query
        const execResult = JSON.parse(result.content[0].text as string);

        // Check if we should try fallback (no results found)
        if (execResult.total_count === 0 && query.fallbackParams) {
          // Try fallback query - filter out null values
          const fallbackQuery: GitHubReposSearchParams = {
            ...enhancedQuery,
            ...Object.fromEntries(
              Object.entries(query.fallbackParams).filter(
                ([_, value]) => value !== null
              )
            ),
          };

          const fallbackResult = await searchGitHubRepos(fallbackQuery);

          if (!fallbackResult.isError) {
            // Success with fallback query
            const fallbackExecResult = JSON.parse(
              fallbackResult.content[0].text as string
            );

            results.push({
              queryId,
              originalQuery: query,
              result: fallbackExecResult,
              fallbackTriggered: true,
              fallbackQuery,
            });
            continue;
          }

          // Both failed - return fallback error
          results.push({
            queryId,
            originalQuery: query,
            result: { total_count: 0, repositories: [] },
            fallbackTriggered: true,
            fallbackQuery,
            error: fallbackResult.content[0].text as string,
          });
          continue;
        }

        // Return original success
        results.push({
          queryId,
          originalQuery: query,
          result: execResult,
          fallbackTriggered: false,
        });
        continue;
      }

      // Original query failed, try fallback if available
      if (query.fallbackParams) {
        const fallbackQuery: GitHubReposSearchParams = {
          ...enhancedQuery,
          ...Object.fromEntries(
            Object.entries(query.fallbackParams).filter(
              ([_, value]) => value !== null
            )
          ),
        };

        const fallbackResult = await searchGitHubRepos(fallbackQuery);

        if (!fallbackResult.isError) {
          // Success with fallback query
          const execResult = JSON.parse(
            fallbackResult.content[0].text as string
          );

          results.push({
            queryId,
            originalQuery: query,
            result: execResult,
            fallbackTriggered: true,
            fallbackQuery,
          });
          continue;
        }

        // Both failed - return fallback error
        results.push({
          queryId,
          originalQuery: query,
          result: { total_count: 0, repositories: [] },
          fallbackTriggered: true,
          fallbackQuery,
          error: fallbackResult.content[0].text as string,
        });
        continue;
      }

      // No fallback available - return original error
      results.push({
        queryId,
        originalQuery: query,
        result: { total_count: 0, repositories: [] },
        fallbackTriggered: false,
        error: result.content[0].text as string,
      });
    } catch (error) {
      // Handle any unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      results.push({
        queryId,
        originalQuery: query,
        result: { total_count: 0, repositories: [] },
        fallbackTriggered: false,
        error: `Unexpected error: ${errorMessage}`,
      });
    }
  }

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(r => !r.error).length;
  const queriesWithFallback = results.filter(r => r.fallbackTriggered).length;
  const totalRepositories = results.reduce(
    (sum, r) => sum + (r.result.total_count || 0),
    0
  );

  return createResult({
    data: {
      results,
      summary: {
        totalQueries,
        successfulQueries,
        queriesWithFallback,
        totalRepositories,
      },
    },
  });
}

export async function searchGitHubRepos(
  params: GitHubReposSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repos', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubReposSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      const execResult = JSON.parse(result.content[0].text as string);
      const repositories = execResult.result;

      if (!Array.isArray(repositories) || repositories.length === 0) {
        return createResult({
          error: createNoResultsError('repositories'),
        });
      }

      const analysis = {
        totalFound: 0,
        languages: new Set<string>(),
        avgStars: 0,
        recentlyUpdated: 0,
        topStarred: [] as Array<{
          name: string;
          stars: number;
          description: string;
          language: string;
          url: string;
          forks: number;
          isPrivate: boolean;
          isArchived: boolean;
          isFork: boolean;
          topics: string[];
          license: string | null;
          hasIssues: boolean;
          openIssuesCount: number;
          createdAt: string;
          updatedAt: string;
          visibility: string;
          owner: string;
        }>,
      };

      analysis.totalFound = repositories.length;

      // Analyze repository data
      let totalStars = 0;
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      repositories.forEach(repo => {
        // Collect languages
        if (repo.language) {
          analysis.languages.add(repo.language);
        }

        // Calculate average stars (use correct field name)
        if (typeof repo.stargazersCount === 'number') {
          totalStars += repo.stargazersCount;
        }

        // Count recently updated repositories (use correct field name)
        if (repo.updatedAt) {
          const updatedDate = new Date(repo.updatedAt);
          if (!isNaN(updatedDate.getTime()) && updatedDate > thirtyDaysAgo) {
            analysis.recentlyUpdated++;
          }
        }
      });

      analysis.avgStars =
        repositories.length > 0
          ? Math.round(totalStars / repositories.length)
          : 0;

      // Get all repositories with comprehensive data
      analysis.topStarred = repositories.map(repo => ({
        name: repo.fullName || repo.name,
        stars: repo.stargazersCount || 0,
        description: repo.description || 'No description',
        language: repo.language || 'Unknown',
        url: repo.url,
        forks: repo.forksCount || 0,
        isPrivate: repo.isPrivate || false,
        isArchived: repo.isArchived || false,
        isFork: repo.isFork || false,
        topics: [], // GitHub CLI search repos doesn't provide topics in JSON output
        license: repo.license?.name || null,
        hasIssues: repo.hasIssues || false,
        openIssuesCount: repo.openIssuesCount || 0,
        createdAt: toDDMMYYYY(repo.createdAt),
        updatedAt: toDDMMYYYY(repo.updatedAt),
        visibility: repo.visibility || 'public',
        owner: repo.owner?.login || repo.owner,
      }));

      return createResult({
        data: {
          total_count: analysis.totalFound,
          ...(analysis.totalFound > 0
            ? {
                repositories: analysis.topStarred,
                summary: {
                  languages: Array.from(analysis.languages).slice(0, 10),
                  avgStars: analysis.avgStars,
                  recentlyUpdated: analysis.recentlyUpdated,
                },
              }
            : {
                repositories: [],
              }),
        },
      });
    } catch (error) {
      return createResult({
        error: createSearchFailedError('repositories'),
      });
    }
  });
}

export function buildGitHubReposSearchCommand(
  params: GitHubReposSearchParams
): {
  command: GhCommand;
  args: string[];
} {
  const builder = new GitHubReposSearchBuilder();
  return { command: 'search', args: builder.build(params) };
}
