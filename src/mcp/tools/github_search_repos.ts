import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubReposAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubReposSearchQuery,
  GitHubReposSearchQuerySchema,
  ProcessedRepoSearchResult,
} from './scheme/github_search_repos';
import {
  generateSmartSuggestions,
  TOOL_SUGGESTION_CONFIGS,
} from './utils/smartSuggestions';
import { ensureUniqueQueryIds } from './utils/queryUtils';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from './utils/bulkOperations';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Search GitHub repositories with intelligent discovery and analysis capabilities.

This tool provides comprehensive repository discovery with progressive refinement,
smart filtering, and context-aware suggestions. It supports bulk operations for
efficient multi-query research and integrates with other tools for complete workflows.

Key Features:
- Smart repository discovery: Find projects by topic, language, or functionality
- Progressive refinement: Start broad, then apply specific filters
- Multi-criteria analysis: Compare repositories by stars, activity, and quality
- Research goal optimization: Tailored suggestions based on your research intent

Best Practices:
- Use descriptive search terms that capture the core functionality
- Leverage sorting by stars or updated date for quality results
- Combine with code search and structure exploration for deep analysis
- Specify research goals for optimized hint generation
`;

interface AggregatedRepoContext {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  foundOwners: Set<string>;
  foundLanguages: Set<string>;
  foundTopics: Set<string>;
  searchPatterns: Set<string>;
  totalStars: number;
  dataQuality: {
    hasResults: boolean;
    hasPopularRepos: boolean;
  };
}

export function registerSearchGitHubReposTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    {
      description: DESCRIPTION,
      inputSchema: GitHubReposSearchQuerySchema.shape,
      annotations: {
        idempotent: true,
        openWorld: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubReposSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
            {
              hasResults: false,
              errorMessage: 'Queries array is required and cannot be empty',
              customHints: [
                'Provide at least one search query with search terms or filters',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
            {
              hasResults: false,
              errorMessage: 'Too many queries provided',
              customHints: [
                'Limit to 5 queries per request for optimal performance',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Maximum 5 queries allowed per request',
            hints,
          });
        }

        return searchMultipleGitHubRepos(
          args.queries,
          args.verbose || false,
          opts
        );
      }
    )
  );
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  verbose: boolean = false,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'repo-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubReposSearchQuery
    ): Promise<ProcessedRepoSearchResult> => {
      try {
        const apiResult = await searchGitHubReposAPI(query, opts.ghToken);

        if ('error' in apiResult) {
          // Generate smart suggestions for this specific query error
          const smartSuggestions = generateSmartSuggestions(
            TOOL_SUGGESTION_CONFIGS.github_search_repositories,
            apiResult.error,
            query
          );

          return {
            queryId: query.id!,
            error: apiResult.error,
            hints: smartSuggestions.hints,
            metadata: {
              queryArgs: query,
              error: apiResult.error,
              searchType: smartSuggestions.searchType,
              suggestions: smartSuggestions.suggestions,
              researchGoal: query.researchGoal || 'discovery',
            },
          };
        }

        // Extract repository data
        const repositories = apiResult.repositories || [];

        return {
          queryId: query.id!,
          data: {
            repositories,
            total_count: apiResult.total_count,
          },
          metadata: {
            queryArgs: query,
            searchType: 'success',
            researchGoal: query.researchGoal || 'discovery',
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const smartSuggestions = generateSmartSuggestions(
          TOOL_SUGGESTION_CONFIGS.github_search_repositories,
          errorMessage,
          query
        );

        return {
          queryId: query.id!,
          error: errorMessage,
          hints: smartSuggestions.hints,
          metadata: {
            queryArgs: query,
            error: errorMessage,
            searchType: smartSuggestions.searchType,
            suggestions: smartSuggestions.suggestions,
            researchGoal: query.researchGoal || 'discovery',
          },
        };
      }
    }
  );

  // Build aggregated context for intelligent hints
  const aggregatedContext: AggregatedRepoContext = {
    totalQueries: results.length,
    successfulQueries: results.filter(r => !r.result.error).length,
    failedQueries: results.filter(r => !!r.result.error).length,
    foundOwners: new Set<string>(),
    foundLanguages: new Set<string>(),
    foundTopics: new Set<string>(),
    searchPatterns: new Set<string>(),
    totalStars: 0,
    dataQuality: {
      hasResults: results.some(
        r =>
          !r.result.error &&
          r.result.data?.repositories &&
          r.result.data.repositories.length > 0
      ),
      hasPopularRepos: false,
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (!result.error && result.data?.repositories) {
      result.data.repositories.forEach((repo: any) => {
        aggregatedContext.foundOwners.add(repo.owner);
        if (repo.language) {
          aggregatedContext.foundLanguages.add(repo.language);
        }
        aggregatedContext.totalStars += repo.stars || 0;

        // Check for popular repositories (>1000 stars)
        if (repo.stars > 1000) {
          aggregatedContext.dataQuality.hasPopularRepos = true;
        }
      });

      // Extract search patterns from query terms
      const queryTerms = result.metadata?.queryArgs?.queryTerms || [];
      queryTerms.forEach((term: any) =>
        aggregatedContext.searchPatterns.add(term)
      );
    }
  });

  // Hints are now generated automatically by createBulkResponse

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    includeAggregatedContext: verbose,
    includeErrors: true,
    maxHints: 8,
  };

  return createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries
  );
}

// End of searchMultipleGitHubRepos function
