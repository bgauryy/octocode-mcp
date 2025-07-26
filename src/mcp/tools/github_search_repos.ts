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
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  PACKAGE_SEARCH_TOOL_NAME,
} from './utils/toolConstants';

const DESCRIPTION = `Search GitHub repositories - Use bulk queries to find repositories with different search criteria in parallel for optimization

Search strategy:
  Use limit=1 on queries as a default (e.g. when searching specific repository)
  Use larget limit for exploratory search (e.g. when searching by topic, language, owner, or keyword)
  If cannot find repository, consider using ${PACKAGE_SEARCH_TOOL_NAME} tool`;

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
    .describe(
      'Sort criteria. RECOMMENDED: Use "stars" for token optimization to get most popular/relevant repositories first.'
    ),
  order: z
    .union([z.enum(['asc', 'desc']), z.null()])
    .optional()
    .describe('Sort order direction.'),
  limit: z
    .union([z.number().int().min(1).max(100), z.null()])
    .optional()
    .describe(
      'Maximum number of repositories to return (1-100). TOKEN OPTIMIZATION: Use 1 for specific repository searches, 10-20 for exploratory discovery. For multiple specific repositories, create separate queries with limit=1 each.'
    ),
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchQuerySchema
>;

export interface GitHubReposSearchQueryResult {
  queryId: string;
  result: any;
  error?: string;
}

export interface GitHubReposResponse {
  data: any[]; // Repository array
  hints: string[];
  metadata?: {
    queries: GitHubReposSearchQueryResult[];
    summary: {
      totalQueries: number;
      successfulQueries: number;
      totalRepositories: number;
    };
  };
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
            'Array of up to 5 different search queries for sequential execution'
          ),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include detailed metadata for debugging. Default: false for cleaner responses'
          ),
      },
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubReposSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubRepos(
            args.queries,
            args.verbose ?? false
          );
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

function validateRepositoryQuery(
  query: GitHubReposSearchQuery,
  queryId: string
): { isValid: boolean; error?: string } {
  // Just check that we have at least one search parameter
  const hasAnyParam = !!(
    query.exactQuery ||
    (query.queryTerms && query.queryTerms.length > 0) ||
    query.owner ||
    query.language ||
    query.topic
  );

  if (!hasAnyParam) {
    return {
      isValid: false,
      error: `Query ${queryId}: At least one search parameter required`,
    };
  }

  return { isValid: true };
}

/**
 * Processes a single query with proper error handling
 * @param query The query to process
 * @param queryId The query identifier
 * @returns Promise resolving to query result
 */
async function processSingleQuery(
  query: GitHubReposSearchQuery,
  queryId: string
): Promise<GitHubReposSearchQueryResult> {
  try {
    // Validate query
    const validation = validateRepositoryQuery(query, queryId);
    if (!validation.isValid) {
      return {
        queryId,
        result: { total_count: 0, repositories: [] },
        error: validation.error,
      };
    }

    // Use query parameters directly without modification, filter out null values
    const enhancedQuery: GitHubReposSearchParams = Object.fromEntries(
      Object.entries(query).filter(
        ([_, value]) => value !== null && value !== undefined
      )
    ) as GitHubReposSearchParams;

    // Execute query
    const result = await searchGitHubRepos(enhancedQuery);

    if (!result.isError) {
      // Success with original query
      const execResult = JSON.parse(result.content[0].text as string);

      // Check for empty results
      if (
        execResult.total_count === 0 ||
        (execResult.result && execResult.result.length === 0)
      ) {
        return {
          queryId,
          result: { total_count: 0, repositories: [] },
          error: 'No repositories found',
        };
      }

      // Return successful result
      return {
        queryId,
        result: execResult,
      };
    }

    // Query failed
    return {
      queryId,
      result: { total_count: 0, repositories: [] },
      error: 'Query failed',
    };
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      queryId,
      result: { total_count: 0, repositories: [] },
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  verbose: boolean = false
): Promise<CallToolResult> {
  const results: GitHubReposSearchQueryResult[] = [];
  const hints: string[] = [];

  // Execute queries sequentially (simple and reliable)
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    const result = await processSingleQuery(query, queryId);
    results.push(result);

    // Generate hints for failures
    if (result.error) {
      if (result.error.includes('No repositories found')) {
        hints.push(
          `Query "${queryId}" found no results - try broader search terms or use packageSearch tool for package discovery`
        );
      } else if (result.error.includes('Query failed')) {
        hints.push(
          `Query "${queryId}" failed - consider simplifying search criteria or checking repository access`
        );
      } else {
        hints.push(`Query "${queryId}" encountered an error: ${result.error}`);
      }
    }
  }

  // Collect all repositories from successful queries
  const allRepositories: any[] = [];
  results.forEach(result => {
    if (!result.error && result.result.repositories) {
      allRepositories.push(...result.result.repositories);
    }
  });

  // Add strategic hints
  if (allRepositories.length === 0) {
    hints.push(
      'No repositories found across all queries - consider using packageSearch for npm/python packages or try different search terms'
    );
  } else if (results.some(r => r.error) && allRepositories.length > 0) {
    hints.push(
      `returned ${allRepositories.length} repositories - some queries failed but data may be sufficient to proceed`
    );
  } else if (!results.some(r => r.error) && allRepositories.length > 0) {
    hints.push(
      `Successfully returned ${allRepositories.length} repositories - proceed with analysis`
    );
  }

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(r => !r.error).length;
  const totalRepositories = allRepositories.length;

  const responseData: any = {
    data: allRepositories,
    hints,
  };

  // Add metadata only if verbose mode is enabled
  if (verbose) {
    responseData.metadata = {
      queries: results,
      summary: {
        totalQueries,
        successfulQueries,
        totalRepositories,
      },
    };
  }

  return createResult({
    data: responseData,
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

      // Return simple repository data
      return createResult({
        data: {
          total_count: repositories.length,
          repositories: repositories.map(repo => ({
            name: repo.fullName || repo.name,
            stars: repo.stargazersCount || 0,
            description:
              (repo.description || 'No description').length > 150
                ? repo.description.substring(0, 150) + '...'
                : repo.description || 'No description',
            language: repo.language || 'Unknown',
            url: repo.url,
            forks: repo.forksCount || 0,
            updatedAt: toDDMMYYYY(repo.updatedAt),
            owner: repo.owner?.login || repo.owner,
          })),
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
