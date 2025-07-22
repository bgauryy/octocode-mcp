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
import {
  safeGetContentText,
  safeParseJsonResult,
} from '../../utils/responseUtils';

export const GITHUB_SEARCH_REPOSITORIES_TOOL_NAME = 'githubSearchRepositories';

// Helper functions for safe type checking
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isValidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !isNaN(value) && isFinite(value);
  if (typeof value === 'string') {
    return /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/.test(value);
  }
  return false;
}

// Helper function removed - now using shared utility from responseUtils

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

  // Helper function to handle fallback query execution
  async function executeFallbackQuery(
    originalQuery: GitHubReposSearchQuery,
    queryId: string
  ): Promise<GitHubReposSearchQueryResult> {
    try {
      // Create clean query by removing metadata fields
      const cleanQuery = Object.fromEntries(
        Object.entries(originalQuery).filter(
          ([key]) => !['fallbackParams', 'id'].includes(key)
        )
      );

      // Create clean fallback params by removing metadata fields
      const cleanFallbackParams = originalQuery.fallbackParams
        ? Object.fromEntries(
            Object.entries(originalQuery.fallbackParams).filter(
              ([key, value]) =>
                !['fallbackParams', 'id'].includes(key) &&
                value !== null &&
                value !== undefined
            )
          )
        : {};

      // Merge clean query with clean fallback params
      const fallbackQuery: GitHubReposSearchParams = {
        ...cleanQuery,
        ...cleanFallbackParams,
      };

      const fallbackResult = await searchGitHubRepos(fallbackQuery);

      if (!fallbackResult.isError) {
        try {
          // Success with fallback query
          const parseResult = safeParseJsonResult(
            fallbackResult,
            'fallback repository search'
          );
          if (!parseResult.success) {
            return {
              queryId,
              originalQuery,
              result: { total_count: 0, repositories: [] },
              fallbackTriggered: true,
              fallbackQuery,
              error: parseResult.error,
            };
          }

          return {
            queryId,
            originalQuery,
            result: parseResult.data,
            fallbackTriggered: true,
            fallbackQuery,
          };
        } catch (parseError) {
          return {
            queryId,
            originalQuery,
            result: { total_count: 0, repositories: [] },
            fallbackTriggered: true,
            fallbackQuery,
            error: `Failed to parse fallback results: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          };
        }
      }

      return {
        queryId,
        originalQuery,
        result: { total_count: 0, repositories: [] },
        fallbackTriggered: true,
        fallbackQuery,
        error: safeGetContentText(fallbackResult),
      };
    } catch (error) {
      return {
        queryId,
        originalQuery,
        result: { total_count: 0, repositories: [] },
        fallbackTriggered: true,
        error: `Fallback query failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  // Execute queries sequentially to avoid rate limits
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    try {
      // Enhanced validation logic for primary filters with proper type checking
      const hasPrimaryFilter =
        isNonEmptyString(query.exactQuery?.trim()) ||
        isNonEmptyArray(query.queryTerms) ||
        isNonEmptyString(query.owner) ||
        isNonEmptyArray(query.owner) ||
        isNonEmptyString(query.language) ||
        isNonEmptyString(query.topic) ||
        isNonEmptyArray(query.topic) ||
        isValidNumber(query.stars) ||
        isValidNumber(query.forks);

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

      // Create clean query by removing metadata fields
      const cleanQuery = Object.fromEntries(
        Object.entries(query).filter(
          ([key]) => !['fallbackParams', 'id'].includes(key)
        )
      );

      // Try original query first
      const result = await searchGitHubRepos(cleanQuery);

      if (!result.isError) {
        try {
          // Success with original query
          const parseResult = safeParseJsonResult(result, 'repository search');
          if (!parseResult.success) {
            results.push({
              queryId,
              originalQuery: query,
              result: { total_count: 0, repositories: [] },
              fallbackTriggered: false,
              error: parseResult.error,
            });
            continue;
          }

          const execResult = parseResult.data;

          // Check if we should try fallback (no results found)
          if (execResult.total_count === 0 && query.fallbackParams) {
            results.push(await executeFallbackQuery(query, queryId));
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
        } catch (parseError) {
          results.push({
            queryId,
            originalQuery: query,
            result: { total_count: 0, repositories: [] },
            fallbackTriggered: false,
            error: `Failed to parse results: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          });
          continue;
        }
      }

      // Original query failed, try fallback if available
      if (query.fallbackParams) {
        results.push(await executeFallbackQuery(query, queryId));
        continue;
      }

      // No fallback available - return original error
      results.push({
        queryId,
        originalQuery: query,
        result: { total_count: 0, repositories: [] },
        fallbackTriggered: false,
        error: safeGetContentText(result),
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

      try {
        const parseResult = safeParseJsonResult(
          result,
          'repository search main'
        );
        if (!parseResult.success) {
          return createResult({
            error: parseResult.error,
          });
        }

        const execResult = parseResult.data;
        const repositories = execResult.result;

        if (!Array.isArray(repositories) || repositories.length === 0) {
          return createResult({
            error: createNoResultsError('repositories'),
          });
        }

        const analysis = {
          totalFound: repositories.length,
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

        // Analyze repository data
        let totalStars = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );

        repositories.forEach(repo => {
          // Safely collect languages
          if (typeof repo.language === 'string' && repo.language.trim()) {
            analysis.languages.add(repo.language.trim());
          }

          // Safely calculate average stars
          const stars = Number(repo.stargazersCount);
          if (!isNaN(stars) && isFinite(stars)) {
            totalStars += stars;
          }

          // Safely count recently updated repositories
          if (repo.updatedAt) {
            try {
              const updatedDate = new Date(repo.updatedAt);
              if (
                isFinite(updatedDate.getTime()) &&
                updatedDate > thirtyDaysAgo
              ) {
                analysis.recentlyUpdated++;
              }
            } catch (e) {
              // Skip invalid dates
            }
          }
        });

        // Safely calculate average stars
        analysis.avgStars =
          repositories.length > 0
            ? Math.round(totalStars / repositories.length)
            : 0;

        // Get all repositories with comprehensive data
        analysis.topStarred = repositories.map(repo => {
          // Safely handle repository name
          const name = repo.fullName || repo.name || 'Unknown Repository';

          // Safely handle numeric values
          const stars = Number(repo.stargazersCount);
          const forks = Number(repo.forksCount);
          const openIssues = Number(repo.openIssuesCount);

          return {
            name,
            stars: !isNaN(stars) && isFinite(stars) ? stars : 0,
            description:
              typeof repo.description === 'string'
                ? repo.description
                : 'No description',
            language:
              typeof repo.language === 'string' ? repo.language : 'Unknown',
            url: repo.url || `https://github.com/${name}`,
            forks: !isNaN(forks) && isFinite(forks) ? forks : 0,
            isPrivate: Boolean(repo.isPrivate),
            isArchived: Boolean(repo.isArchived),
            isFork: Boolean(repo.isFork),
            topics: Array.isArray(repo.topics) ? repo.topics : [],
            license: repo.license?.name || null,
            hasIssues: Boolean(repo.hasIssues),
            openIssuesCount:
              !isNaN(openIssues) && isFinite(openIssues) ? openIssues : 0,
            createdAt: repo.createdAt ? toDDMMYYYY(repo.createdAt) : 'Unknown',
            updatedAt: repo.updatedAt ? toDDMMYYYY(repo.updatedAt) : 'Unknown',
            visibility:
              typeof repo.visibility === 'string' ? repo.visibility : 'public',
            owner:
              repo.owner?.login ||
              (typeof repo.owner === 'string' ? repo.owner : 'Unknown'),
          };
        });

        return createResult({
          data: {
            total_count: analysis.totalFound,
            repositories: analysis.topStarred,
            summary: {
              languages: Array.from(analysis.languages).slice(0, 10),
              avgStars: analysis.avgStars,
              recentlyUpdated: analysis.recentlyUpdated,
            },
          },
        });
      } catch (parseError) {
        return createResult({
          error: `Failed to parse GitHub response: ${
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          }`,
        });
      }
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
