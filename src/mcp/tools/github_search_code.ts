import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import { getResearchGoalHints } from './utils/toolRelationships';
import { searchGitHubCodeAPI, getDefaultBranch } from '../../utils/githubAPI';
import {
  GitHubCodeSearchQuerySchema,
  GitHubCodeSearchQuery,
  ProcessedCodeSearchResult,
  OptimizedCodeSearchResult,
  GitHubCodeSearchResponse,
  GitHubCodeSearchMeta,
} from './scheme/github_search_code';

// Extended type for API response with research context
interface CodeSearchAPIResponse extends OptimizedCodeSearchResult {
  _researchContext?: {
    foundPackages: string[];
    foundFiles: string[];
    repositoryContext?: {
      owner: string;
      repo: string;
    };
  };
}

interface AggregatedContext {
  foundPackages: Set<string>;
  foundFiles: Set<string>;
  repositoryContexts: Set<string>;
  searchPatterns: Set<string>;
  successfulQueries: number;
  dataQuality: {
    hasContent: boolean;
    hasMatches: boolean;
  };
}

const DESCRIPTION = `Strategic code search across GitHub repositories with intelligent query analysis.

Supports semantic and technical search patterns with progressive refinement capabilities.
Each query provides complete context including failure analysis and adaptive suggestions.
Results include both successful matches and actionable insights for query optimization.`;

export function registerGitHubSearchCodeTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubCodeSearchQuerySchema)
          .min(1)
          .max(5)
          .describe(
            '1-5 progressive refinement queries, starting broad then narrowing. PROGRESSIVE STRATEGY: Query 1 should be broad (queryTerms + owner/repo only), then progressively add filters based on initial findings. Use meaningful id descriptions to track refinement phases.'
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
        title: 'GitHub Code Search - Progressive Refinement',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubCodeSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubCode(
            args.queries,
            args.verbose ?? false,
            opts
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          return createResult({
            isError: true,
            hints: [
              `Failed to search code: ${errorMessage}. Try broader search terms or check repository access.`,
            ],
          });
        }
      }
    )
  );
}

/**
 * Ensures unique queryIds across all queries in a batch using efficient single-pass algorithm
 *
 * Performance: O(n) time complexity vs O(n²) worst-case of the previous while-loop approach
 * Memory: Uses Map for counting vs Set + string concatenation in loops
 *
 * @param queries Array of queries that may have duplicate or missing IDs
 * @returns Array of queries with guaranteed unique IDs
 */
export function ensureUniqueQueryIds(
  queries: Partial<GitHubCodeSearchQuery>[]
): GitHubCodeSearchQuery[] {
  const idCounts = new Map<string, number>();

  return queries.map((query, index) => {
    const baseId = query.id || `query_${index + 1}`;
    const count = idCounts.get(baseId) || 0;
    idCounts.set(baseId, count + 1);

    const uniqueId = count === 0 ? baseId : `${baseId}_${count}`;

    return {
      minify: true,
      sanitize: true,
      ...query,
      id: uniqueId,
    } as GitHubCodeSearchQuery;
  });
}

/**
 * Execute multiple GitHub code search queries using API
 */
async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  verbose: boolean = false,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const processedResults: ProcessedCodeSearchResult[] = [];
  const errors: Array<{
    queryId: string;
    error: string;
    recoveryHints?: string[];
  }> = [];
  const aggregatedContext: AggregatedContext = {
    foundPackages: new Set<string>(),
    foundFiles: new Set<string>(),
    repositoryContexts: new Set<string>(),
    searchPatterns: new Set<string>(),
    successfulQueries: 0,
    dataQuality: { hasContent: false, hasMatches: false },
  };

  // Ensure all queries have unique IDs
  const uniqueQueries = ensureUniqueQueryIds(queries);

  // Execute each query
  for (let index = 0; index < uniqueQueries.length; index++) {
    const query = uniqueQueries[index];
    const queryId = query.id!; // Now guaranteed to exist and be unique

    // Add default branch to query if owner and repo are specified
    let enhancedQuery = query;
    if (query.owner && query.repo) {
      // Handle both single string and array formats
      const owner = Array.isArray(query.owner) ? query.owner[0] : query.owner;
      const repo = Array.isArray(query.repo) ? query.repo[0] : query.repo;

      try {
        const defaultBranch = await getDefaultBranch(owner, repo, opts.ghToken);
        if (defaultBranch) {
          enhancedQuery = { ...query, branch: defaultBranch };
        }
      } catch (error) {
        // Continue with original query if branch detection fails
        // Silently continue - branch detection is optional
      }
    }

    try {
      // Execute API search with enhanced query
      const result = await searchGitHubCodeAPI(enhancedQuery, opts.ghToken);

      // Check if result is an error - include as failed query data item
      if ('error' in result) {
        const smartSuggestions = generateSmartQuerySuggestions(
          result.error,
          enhancedQuery
        );

        // Add failed query as a data item with full context
        processedResults.push({
          queryId,
          matches: [],
          researchGoal: enhancedQuery.researchGoal,
          failed: true,
          hints: smartSuggestions.hints,
          // Only add meta for failed queries or when verbose
          meta: {
            queryArgs: enhancedQuery,
            error: result.error,
            searchType: smartSuggestions.searchType,
            suggestions: smartSuggestions.suggestions,
          },
        });

        // Still track in errors for global meta
        errors.push({
          queryId,
          error: result.error,
          recoveryHints: smartSuggestions.hints,
        });
        continue;
      }

      // Process successful results
      const searchData = result as CodeSearchAPIResponse;

      // Extract research context
      if (searchData._researchContext) {
        searchData._researchContext.foundPackages?.forEach((pkg: string) =>
          aggregatedContext.foundPackages.add(pkg)
        );
        searchData._researchContext.foundFiles?.forEach((file: string) =>
          aggregatedContext.foundFiles.add(file)
        );
        if (searchData._researchContext.repositoryContext) {
          const { owner, repo } = searchData._researchContext.repositoryContext;
          aggregatedContext.repositoryContexts.add(`${owner}/${repo}`);
        }
      }

      // Process successful results or no results
      if (searchData.items && searchData.items.length > 0) {
        aggregatedContext.successfulQueries++;
        aggregatedContext.dataQuality.hasContent = true;

        searchData.items.forEach(item => {
          // Extract and track search patterns for context
          if (enhancedQuery.queryTerms) {
            enhancedQuery.queryTerms.forEach(term =>
              aggregatedContext.searchPatterns.add(term)
            );
          }

          // Extract matches (already processed by githubAPI.ts)
          const matches = item.matches?.map(match => match.context) || [];

          if (matches.length > 0) {
            aggregatedContext.dataQuality.hasMatches = true;
          }

          // For successful results, only include meta if verbose is true
          const resultData: ProcessedCodeSearchResult = {
            queryId,
            repository: item.repository.nameWithOwner,
            path: item.path,
            matches: matches,
            researchGoal: enhancedQuery.researchGoal,
          };

          // Only add meta for verbose mode (don't include searchType for success)
          if (verbose) {
            resultData.meta = {
              queryArgs: enhancedQuery,
            };
          }

          processedResults.push(resultData);
        });
      } else {
        // Query succeeded but no results found - treat as smart failure
        const smartSuggestions = generateSmartQuerySuggestions(
          'No results found',
          enhancedQuery
        );

        processedResults.push({
          queryId,
          matches: [],
          researchGoal: enhancedQuery.researchGoal,
          failed: true,
          hints: smartSuggestions.hints,
          // Always add meta for failed queries
          meta: {
            queryArgs: enhancedQuery,
            searchType: 'no_results',
            suggestions: smartSuggestions.suggestions,
          },
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const smartSuggestions = generateSmartQuerySuggestions(
        errorMessage,
        enhancedQuery
      );

      // Add exception as failed query data item
      processedResults.push({
        queryId,
        matches: [],
        researchGoal: enhancedQuery.researchGoal,
        failed: true,
        hints: smartSuggestions.hints,
        // Always add meta for failed queries
        meta: {
          queryArgs: enhancedQuery,
          error: errorMessage,
          searchType: smartSuggestions.searchType,
          suggestions: smartSuggestions.suggestions,
        },
      });

      errors.push({
        queryId,
        error: errorMessage,
        recoveryHints: smartSuggestions.hints,
      });
    }
  }

  // 6. Generate Context-Aware Smart Hints based on actual response data
  const hints = generateResponseDrivenHints({
    processedResults,
    errors,
    aggregatedContext,
    queries,
  });

  // Create standardized response using generic structure

  // Extract unique repositories for meta (exclude failed queries without repositories)
  const repositories = Array.from(
    new Set(
      processedResults
        .map(r => r.repository)
        .filter((repo): repo is string => repo !== undefined)
    )
  ).map(nameWithOwner => ({ nameWithOwner }));

  // Build meta object with proper typing
  const meta: GitHubCodeSearchMeta = {
    // Base metadata
    researchGoal: queries[0]?.researchGoal || 'general',
    totalOperations: queries.length,
    successfulOperations: queries.length - errors.length,
    failedOperations: errors.length,
    ...(errors.length > 0 && {
      errors: errors.map(e => ({
        operationId: e.queryId,
        error: e.error,
        hints: e.recoveryHints,
      })),
    }),

    // GitHub Code Search specific metadata
    repositories,
    totalRepositories: repositories.length,
    ...(verbose && {
      researchContext: {
        foundPackages: Array.from(aggregatedContext.foundPackages),
        foundFiles: Array.from(aggregatedContext.foundFiles),
        repositoryContexts: Array.from(aggregatedContext.repositoryContexts),
      },
    }),
  };

  const response: GitHubCodeSearchResponse = {
    data: processedResults,
    meta,
    hints,
  };

  // 9. Return via createResult (cached automatically by directCache)
  return createResult(response);
}

/**
 * Generate smart suggestions and hints for failed queries
 */
function generateSmartQuerySuggestions(
  error: string,
  query: GitHubCodeSearchQuery
): {
  hints: string[];
  searchType: 'no_results' | 'api_error' | 'validation_error';
  suggestions: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    splitQueries?: GitHubCodeSearchQuery[];
  };
} {
  const hints: string[] = [];
  const errorLower = error.toLowerCase();
  let searchType: 'no_results' | 'api_error' | 'validation_error';
  const suggestions: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    splitQueries?: GitHubCodeSearchQuery[];
  } = {};

  // Determine search type and generate specific suggestions
  if (errorLower.includes('rate limit') || errorLower.includes('403')) {
    searchType = 'api_error';
    hints.push('Rate limited - wait a few minutes before retrying');
    hints.push('Use more specific search terms to reduce API calls');
    hints.push('Consider adding owner/repo filters to narrow search scope');
  } else if (errorLower.includes('not found') || errorLower.includes('404')) {
    searchType = 'api_error';
    hints.push('Repository may be private or non-existent');
    hints.push('Check repository name spelling and accessibility');

    if (query.owner && query.repo) {
      suggestions.broaderSearch = [
        `Remove repo filter: search across all ${query.owner} repositories`,
        'Try searching in public repositories only',
      ];
    }
  } else if (errorLower.includes('timeout') || errorLower.includes('network')) {
    searchType = 'api_error';
    hints.push('Network issue - retry the same query');
    hints.push('Try reducing query scope with fewer search terms');
  } else if (
    errorLower.includes('validation') ||
    errorLower.includes('invalid')
  ) {
    searchType = 'validation_error';
    hints.push('Check query syntax and required parameters');
    hints.push('Ensure queryTerms array is not empty if provided');
  } else {
    // Assume no results found
    searchType = 'no_results';

    // Generate broader search suggestions
    if (query.queryTerms && query.queryTerms.length > 1) {
      suggestions.broaderSearch = [
        'Try individual search terms separately',
        'Use fewer, more general keywords',
        'Remove specific technical terms',
      ];

      // Create split queries for each term
      suggestions.splitQueries = query.queryTerms.map((term, index) => ({
        ...query,
        id: `${query.id || 'split'}-${index + 1}`,
        queryTerms: [term],
      }));
    }

    // Generate semantic alternatives based on research goal
    if (query.researchGoal === 'debugging') {
      suggestions.semanticAlternatives = [
        'error handling',
        'exception',
        'try catch',
        'debug',
        'log',
        'test failure',
        'bug fix',
        'regression',
      ];
    } else if (query.researchGoal === 'code_analysis') {
      suggestions.semanticAlternatives = [
        'function',
        'method',
        'class',
        'interface',
        'implementation',
        'pattern',
        'architecture',
        'design',
      ];
    } else if (query.researchGoal === 'code_generation') {
      suggestions.semanticAlternatives = [
        'example',
        'template',
        'boilerplate',
        'starter',
        'sample',
        'tutorial',
        'guide',
        'documentation',
      ];
    }

    hints.push('No matches found - try these smart strategies:');
    hints.push('→ Use broader, more general search terms');
    hints.push('→ Try semantic alternatives related to your research goal');
    hints.push('→ Remove specific filters and search across more repositories');
    hints.push('→ Split complex queries into simpler individual searches');
  }

  return { hints, searchType, suggestions };
}

/**
 * Generate smart hints based on actual response data patterns
 */
function generateResponseDrivenHints({
  processedResults,
  errors,
  aggregatedContext,
  queries,
}: {
  processedResults: ProcessedCodeSearchResult[];
  errors: Array<{ queryId: string; error: string; recoveryHints?: string[] }>;
  aggregatedContext: AggregatedContext;
  queries: GitHubCodeSearchQuery[];
}): string[] {
  const hints: string[] = [];
  const totalItems = processedResults.length;
  const hasResults = totalItems > 0;
  const failedQueries = processedResults.filter(r => r.failed).length;

  // Handle failed queries first
  if (failedQueries > 0) {
    const failedQueryIds = processedResults
      .filter(r => r.failed)
      .map(r => r.queryId)
      .join(', ');
    hints.push(
      `${failedQueries} queries failed (${failedQueryIds}). Check individual query hints for solutions and retry.`
    );
  }

  // Research hints based on actual response data
  if (hasResults) {
    // Extract unique repositories for context (filter out failed queries)
    const repositories = new Set(
      processedResults
        .map(r => r.repository)
        .filter((repo): repo is string => repo !== undefined)
    );

    if (repositories.size === 1) {
      hints.push(
        `Use githubGetFileContent with matchString to get complete implementation context and understand the full flow`
      );
    } else if (repositories.size > 1) {
      hints.push(
        `Found results across ${repositories.size} repositories. Compare implementations to identify patterns and best practices`
      );
    }

    // Pattern-based insights
    if (aggregatedContext.searchPatterns.size > 0) {
      const patternCount = aggregatedContext.searchPatterns.size;
      hints.push(
        `Found ${patternCount} different patterns. Use githubGetFileContent to examine complete implementations and understand usage contexts`
      );
    }

    // Suggest next research steps
    hints.push(
      'Consider searching for related terms, test files, or documentation to get comprehensive understanding'
    );
  } else if (errors.length > 0) {
    // Error hints with recovery actions
    const firstError = errors[0];
    if (firstError.recoveryHints) {
      hints.push(...firstError.recoveryHints);
    }

    // General recovery strategies
    hints.push(
      'Try broader search terms, remove filters, or search different repositories'
    );
  } else {
    // No results, no errors - provide efficient LLM guidance
    hints.push(
      'No matches found. Try broader keywords, different search terms, or remove filters to expand search scope'
    );
  }

  // Context-aware research goal hints (now required)
  const researchGoal = queries[0]?.researchGoal; // Get from first query since it's now required
  if (researchGoal && hasResults) {
    const goalHints = getResearchGoalHints(
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      researchGoal
    );
    hints.push(...goalHints);
  }

  return hints;
}
