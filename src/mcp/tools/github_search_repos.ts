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
import type { Repository } from '../../types/github-openapi';
import { ensureUniqueQueryIds } from './utils/queryUtils';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from './utils/bulkOperations';
import {
  generateToolHints,
  generateSmartSuggestions,
  TOOL_SUGGESTION_CONFIGS,
} from './utils/hints_consolidated';

const DESCRIPTION = `Search GitHub repositories with smart filtering and bulk operations.

KEY FEATURES:
- Bulk queries: Execute up to 5 searches in parallel for comprehensive discovery
- Topic search: Find repos by github topics (exploretory and searching for specific topics)
- Text search: Match specific terms in names/descriptions
- Quality filters: Stars, forks, activity, update frequency
- Smart defaults: Excludes archived repos and forks for better results

SEARCH STRATEGIES:
- for specific repositorry search with limit of 1 and get most relevant repository
- Exploration: Use bulk search efficiently with several search directions (e.g. terms, topics)

TIP: If repo not found, try ${TOOL_NAMES.PACKAGE_SEARCH} for npm/python packages search to get the github repo`;

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
  opts: ToolOptions
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
  opts: ToolOptions
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
            TOOL_SUGGESTION_CONFIGS.githubSearchRepositories,
            apiResult.error,
            query
          );

          return {
            queryId: query.id!,
            error: apiResult.error,
            hints: smartSuggestions.hints,
            metadata: {
              queryArgs: { ...query },
              error: apiResult.error,
              researchGoal: query.researchGoal || 'discovery',
            },
          };
        }

        // Extract repository data
        const repositories = apiResult.data.repositories || [];
        const hasResults =
          repositories.length > 0 && (apiResult.data.total_count || 0) > 0;

        const typedRepositories = repositories as unknown as Repository[];

        return {
          queryId: query.id!,
          data: {
            repositories: typedRepositories,
            total_count: apiResult.data.total_count,
          },
          metadata: {
            // Only include queryArgs for no-result cases
            ...(hasResults ? {} : { queryArgs: { ...query } }),
            searchType: 'success',
            researchGoal: query.researchGoal || 'discovery',
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const smartSuggestions = generateSmartSuggestions(
          TOOL_SUGGESTION_CONFIGS.githubSearchRepositories,
          errorMessage,
          query
        );

        return {
          queryId: query.id!,
          error: errorMessage,
          hints: smartSuggestions.hints,
          metadata: {
            queryArgs: { ...query },
            error: errorMessage,
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
      result.data.repositories.forEach((repo: Repository) => {
        aggregatedContext.foundOwners.add(repo.owner.login);
        if (repo.language) {
          aggregatedContext.foundLanguages.add(repo.language);
        }
        aggregatedContext.totalStars += repo.stargazers_count || 0;

        // Check for popular repositories (>1000 stars)
        if (repo.stargazers_count > 1000) {
          aggregatedContext.dataQuality.hasPopularRepos = true;
        }
      });

      // Extract search patterns from query terms
      const queryArgs = result.metadata?.queryArgs as
        | { queryTerms?: string[] }
        | undefined;
      const queryTerms = queryArgs?.queryTerms || [];
      if (Array.isArray(queryTerms)) {
        queryTerms.forEach((term: string) =>
          aggregatedContext.searchPatterns.add(term)
        );
      }
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
