/* eslint-disable no-console */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchItem, OptimizedCodeSearchResult } from '../../types';
import {
  createResult,
  simplifyRepoUrl,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { GitHubCodeSearchBuilder } from './utils/GitHubCommandBuilder';

export const GITHUB_SEARCH_CODE_TOOL_NAME = 'githubSearchCode';

const DESCRIPTION = `Search code across GitHub repositories using GitHub CLI.

BULK QUERY MODE:
- queries: array of up to 5 different search queries for parallel execution
- Each query can have fallbackParams for automatic retry with modified parameters
- Optimizes research workflow by executing multiple searches simultaneously
- Each query should target different angles/aspects of your research
- Fallback logic automatically broadens search if no results found

Use for comprehensive research - query different repos, languages, or approaches in one call.`;

// Define the code search query schema
const GitHubCodeSearchQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  exactQuery: z.string().optional().describe('Exact phrase/word to search for'),
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Array of search terms joined with spaces (AND logic)'),
  language: z.string().optional().describe('Programming language filter'),
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner/organization name(s)'),
  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository filter'),
  filename: z
    .string()
    .optional()
    .describe('Target specific filename or pattern'),
  extension: z.string().optional().describe('File extension filter'),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe('Search scope: file for content, path for filenames'),
  size: z
    .string()
    .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
    .optional()
    .describe('File size filter in KB'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results per query'),
  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),
  fallbackParams: z
    .object({
      exactQuery: z.string().optional(),
      queryTerms: z.array(z.string()).optional(),
      language: z.string().optional(),
      owner: z.union([z.string(), z.array(z.string())]).optional(),
      repo: z.union([z.string(), z.array(z.string())]).optional(),
      filename: z.string().optional(),
      extension: z.string().optional(),
      match: z.enum(['file', 'path']).optional(),
      size: z
        .string()
        .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
        .optional(),
      limit: z.number().int().min(1).max(100).optional(),
      visibility: z.enum(['public', 'private', 'internal']).optional(),
    })
    .optional()
    .describe(
      'Fallback parameters if original query returns no results, overrides the original query and try again'
    ),
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export interface GitHubCodeSearchQueryResult {
  queryId: string;
  originalQuery: GitHubCodeSearchQuery;
  result: OptimizedCodeSearchResult;
  fallbackTriggered: boolean;
  fallbackQuery?: GitHubCodeSearchQuery;
  error?: string;
}

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_CODE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubCodeSearchQuerySchema)
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different search queries for parallel execution'
          ),
      },
      annotations: {
        title: 'GitHub Code Search - Bulk Queries Only (Optimized)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubCodeSearchQuery[];
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubCode(args.queries);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return createResult({
            error: `Failed to search code: ${errorMessage}. Try broader search terms or check repository access.`,
          });
        }
      }
    )
  );
}

// Helper functions for safe type checking
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

// Helper function for safe content access
function safeGetContentText(result: any): string {
  if (
    result?.content &&
    Array.isArray(result.content) &&
    result.content.length > 0
  ) {
    return (result.content[0].text as string) || 'Empty response';
  }
  return 'Unknown error: No content in response';
}

// Helper function for safe array index access
function safeGetIndices(match: any): [number, number] {
  if (
    match?.indices &&
    Array.isArray(match.indices) &&
    match.indices.length >= 2 &&
    typeof match.indices[0] === 'number' &&
    typeof match.indices[1] === 'number' &&
    !isNaN(match.indices[0]) &&
    !isNaN(match.indices[1]) &&
    isFinite(match.indices[0]) &&
    isFinite(match.indices[1])
  ) {
    return [match.indices[0], match.indices[1]];
  }
  return [0, 0];
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[]
): Promise<CallToolResult> {
  const results: GitHubCodeSearchQueryResult[] = [];

  // Helper function to handle fallback query execution
  async function executeFallbackQuery(
    originalQuery: GitHubCodeSearchQuery,
    queryId: string
  ): Promise<GitHubCodeSearchQueryResult> {
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
      const fallbackQuery: GitHubCodeSearchQuery = {
        ...cleanQuery,
        ...cleanFallbackParams,
      };

      const fallbackResult = await searchGitHubCode(fallbackQuery);

      if (!fallbackResult.isError) {
        try {
          const fallbackExecResult = JSON.parse(
            safeGetContentText(fallbackResult)
          );
          const fallbackCodeResults: GitHubCodeSearchItem[] =
            fallbackExecResult.result;
          const fallbackItems = Array.isArray(fallbackCodeResults)
            ? fallbackCodeResults
            : [];
          const fallbackOptimizedResult =
            transformToOptimizedFormat(fallbackItems);

          return {
            queryId,
            originalQuery,
            result: fallbackOptimizedResult,
            fallbackTriggered: true,
            fallbackQuery,
          };
        } catch (parseError) {
          return {
            queryId,
            originalQuery,
            result: { items: [], total_count: 0 },
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
        result: { items: [], total_count: 0 },
        fallbackTriggered: true,
        fallbackQuery,
        error: safeGetContentText(fallbackResult),
      };
    } catch (error) {
      return {
        queryId,
        originalQuery,
        result: { items: [], total_count: 0 },
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
        isNonEmptyArray(query.queryTerms);

      if (!hasPrimaryFilter) {
        results.push({
          queryId,
          originalQuery: query,
          result: { items: [], total_count: 0 },
          fallbackTriggered: false,
          error: `Query ${queryId}: At least one search parameter required (exactQuery OR queryTerms)`,
        });
        continue;
      }

      // Try original query first using the working function directly
      // Create clean query by removing metadata fields
      const cleanQuery = Object.fromEntries(
        Object.entries(query).filter(
          ([key]) => !['fallbackParams', 'id'].includes(key)
        )
      );
      const result = await searchGitHubCode(cleanQuery);

      if (!result.isError) {
        try {
          // Success with original query
          const execResult = JSON.parse(safeGetContentText(result));
          const codeResults: GitHubCodeSearchItem[] = execResult.result;
          const items = Array.isArray(codeResults) ? codeResults : [];
          const optimizedResult = transformToOptimizedFormat(items);

          // Check if we should try fallback (no results found)
          if (items.length === 0 && query.fallbackParams) {
            results.push(await executeFallbackQuery(query, queryId));
            continue;
          }

          // Return original success
          results.push({
            queryId,
            originalQuery: query,
            result: optimizedResult,
            fallbackTriggered: false,
          });
          continue;
        } catch (parseError) {
          results.push({
            queryId,
            originalQuery: query,
            result: { items: [], total_count: 0 },
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
        result: { items: [], total_count: 0 },
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
        result: { items: [], total_count: 0 },
        fallbackTriggered: false,
        error: `Unexpected error: ${errorMessage}`,
      });
    }
  }

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(r => !r.error).length;
  const queriesWithFallback = results.filter(r => r.fallbackTriggered).length;

  return createResult({
    data: {
      results,
      summary: {
        totalQueries,
        successfulQueries,
        queriesWithFallback,
      },
    },
  });
}

/**
 * Handles various search errors and returns a formatted CallToolResult with smart fallbacks.
 */
function handleSearchError(errorMessage: string): CallToolResult {
  // Rate limit with smart timing guidance
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return createResult({
      error: `GitHub API rate limit reached. Try again in 5-10 minutes, or use these strategies:
• Search fewer terms per query
• Use owner/repo filters to narrow scope
• Try npm package search for package-related queries
• Use separate searches instead of complex queries`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status
3. For private repos: use api_status_check to verify org access`,
    });
  }

  // Network/timeout with fallback suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. Try these alternatives:
• Reduce search scope with owner or language filters
• Use github_search_repos to find repositories first
• Try npm package search for package discovery
• Check network connection and retry`,
    });
  }

  // Invalid query with specific fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. Common fixes:
• Remove special characters: ()[]{}*?^$|.\\
• Use quotes only for exact phrases: "error handling"
• Avoid escaped quotes: use term instead of "term"
• Try broader terms: "react" instead of "React.Component"`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. Discovery strategies:
• Use github_search_repos to find correct names
• Check for typos in owner/repo names
• Try without owner filter for broader search
• Use npm package search if looking for packages`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System issue - try:
• Update GitHub CLI: gh extension upgrade
• Retry in a few moments
• Use github_search_repos as alternative
• Check gh auth status for authentication`,
    });
  }

  // Generic fallback with progressive strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

Progressive recovery strategy:
1. Try broader search terms
2. Use github_search_repos to find repositories
3. Use npm package search for package-related queries
4. Check github CLI status: gh auth status`,
  });
}

/**
 * Transform GitHub CLI response to optimized format with enhanced metadata
 */
function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[]
): OptimizedCodeSearchResult {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  const optimizedItems = items.map(item => ({
    path: item.path,
    matches:
      item.textMatches?.map(match => ({
        context: optimizeTextMatch(match.fragment, 120),
        positions: match.matches?.map(m => safeGetIndices(m)) || [],
      })) || [],
    url: singleRepo ? item.path : simplifyGitHubUrl(item.url),
    repository: {
      nameWithOwner: item.repository.nameWithOwner,
      url: item.repository.url,
    },
  }));

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: simplifyRepoUrl(singleRepo.url),
    };
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Build command line arguments for GitHub CLI following the exact CLI format.
 * Uses proper flags (--flag=value) for filters and direct query terms.
 */
export function buildGitHubCliArgs(params: GitHubCodeSearchQuery): string[] {
  const builder = new GitHubCodeSearchBuilder();
  return builder.build(params);
}

export async function searchGitHubCode(
  params: GitHubCodeSearchQuery
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const args = buildGitHubCliArgs(params);

      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      return handleSearchError(errorMessage);
    }
  });
}
