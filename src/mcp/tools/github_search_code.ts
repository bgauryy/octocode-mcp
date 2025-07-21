/* eslint-disable no-console */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCodeSearchItem,
  OptimizedCodeSearchResult,
  GitHubBulkCodeSearchParams,
  GitHubCodeSearchQuery,
  GitHubBulkCodeSearchResult,
} from '../../types';
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

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_CODE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        // Bulk query mode (recommended)
        queries: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe('Optional identifier for the query'),
              exactQuery: z
                .string()
                .optional()
                .describe('Exact phrase/word to search for'),
              queryTerms: z
                .array(z.string())
                .optional()
                .describe(
                  'Array of search terms joined with spaces (AND logic)'
                ),
              language: z
                .string()
                .optional()
                .describe('Programming language filter'),
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
              extension: z
                .string()
                .optional()
                .describe('File extension filter'),
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
                .default(30)
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
                  visibility: z
                    .enum(['public', 'private', 'internal'])
                    .optional(),
                })
                .optional()
                .describe(
                  'Fallback parameters if original query returns no results'
                ),
            })
          )
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different search queries for parallel execution'
          ),
      },
      annotations: {
        title: 'GitHub Code Search - Bulk Mode Only',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubBulkCodeSearchParams): Promise<CallToolResult> => {
        const { queries } = args;

        // Validate queries array
        if (!queries || queries.length === 0) {
          return createResult({
            error: 'Bulk mode requires at least one query in queries array',
          });
        }

        if (queries.length > 5) {
          return createResult({
            error: 'Maximum 5 queries allowed in bulk mode',
          });
        }

        // Helper function to clean null values (convert to undefined)
        const cleanParams = (params: any): any => {
          const cleaned: any = {};
          Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
              cleaned[key] = params[key];
            }
          });
          return cleaned;
        };

        try {
          // Execute all queries in parallel
          const results = await Promise.allSettled(
            queries.map(async (query, index) => {
              const queryId = query.id || `query_${index + 1}`;

              // Validate single query
              const hasExactQuery = !!query.exactQuery;
              const hasQueryTerms =
                query.queryTerms && query.queryTerms.length > 0;

              if (!hasExactQuery && !hasQueryTerms) {
                throw new Error(
                  `Query ${queryId}: One search parameter required: exactQuery OR queryTerms`
                );
              }

              if (hasExactQuery && hasQueryTerms) {
                throw new Error(
                  `Query ${queryId}: Use either exactQuery OR queryTerms, not both`
                );
              }

              // Convert to GitHubCodeSearchParams format
              const searchParams: any = cleanParams({
                exactQuery: query.exactQuery,
                queryTerms: query.queryTerms,
                owner: query.owner,
                repo: query.repo,
                language: query.language,
                filename: query.filename,
                extension: query.extension,
                match: query.match,
                size: query.size,
                limit: query.limit || 30,
                visibility: query.visibility,
              });

              // Execute original query
              let result = await searchGitHubCode(searchParams);
              let fallbackTriggered = false;
              let fallbackQuery: GitHubCodeSearchQuery | undefined;

              // Check if we need to use fallback
              if (!result.isError) {
                const execResult = JSON.parse(result.content[0].text as string);
                const codeResults: GitHubCodeSearchItem[] = execResult.result;
                const items = Array.isArray(codeResults) ? codeResults : [];

                // If no results and fallback params are provided, try fallback
                if (items.length === 0 && query.fallbackParams) {
                  fallbackTriggered = true;

                  // Merge original params with fallback params (fallback overrides)
                  fallbackQuery = {
                    ...query,
                    ...query.fallbackParams,
                    id: queryId + '_fallback',
                  };

                  const fallbackSearchParams: any = cleanParams({
                    exactQuery: fallbackQuery.exactQuery,
                    queryTerms: fallbackQuery.queryTerms,
                    owner: fallbackQuery.owner,
                    repo: fallbackQuery.repo,
                    language: fallbackQuery.language,
                    filename: fallbackQuery.filename,
                    extension: fallbackQuery.extension,
                    match: fallbackQuery.match,
                    size: fallbackQuery.size,
                    limit: fallbackQuery.limit || 30,
                    visibility: fallbackQuery.visibility,
                  });

                  result = await searchGitHubCode(fallbackSearchParams);
                }
              }

              // Process result
              if (result.isError) {
                throw new Error(result.content[0].text as string);
              }

              const execResult = JSON.parse(result.content[0].text as string);
              const codeResults: GitHubCodeSearchItem[] = execResult.result;
              const items = Array.isArray(codeResults) ? codeResults : [];
              const optimizedResult = transformToOptimizedFormat(items);

              return {
                queryId,
                originalQuery: query,
                result: optimizedResult,
                fallbackTriggered,
                fallbackQuery,
              };
            })
          );

          // Process results
          const bulkResult: GitHubBulkCodeSearchResult = {
            results: [],
            totalQueries: queries.length,
            successfulQueries: 0,
            queriesWithFallback: 0,
          };

          results.forEach((result, index) => {
            const queryId = queries[index].id || `query_${index + 1}`;

            if (result.status === 'fulfilled') {
              bulkResult.results.push(result.value);
              bulkResult.successfulQueries++;
              if (result.value.fallbackTriggered) {
                bulkResult.queriesWithFallback++;
              }
            } else {
              bulkResult.results.push({
                queryId,
                originalQuery: queries[index],
                result: { items: [], total_count: 0 },
                fallbackTriggered: false,
                error: result.reason?.message || 'Unknown error occurred',
              });
            }
          });

          return createResult({ data: bulkResult });
        } catch (error) {
          const errorMessage = (error as Error).message || '';
          return createResult({
            error: `Bulk search failed: ${errorMessage}`,
          });
        }
      }
    )
  );
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
        context: optimizeTextMatch(match.fragment, 120), // Increased context for better understanding
        positions:
          match.matches?.map(m =>
            Array.isArray(m.indices) && m.indices.length >= 2
              ? ([m.indices[0], m.indices[1]] as [number, number])
              : ([0, 0] as [number, number])
          ) || [],
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
export function buildGitHubCliArgs(params: any): string[] {
  const builder = new GitHubCodeSearchBuilder();
  return builder.build(params);
}

export async function searchGitHubCode(params: any): Promise<CallToolResult> {
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
