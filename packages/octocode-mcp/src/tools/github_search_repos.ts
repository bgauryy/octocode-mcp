import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubReposAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubReposSearchQuery,
  GitHubReposSearchQuerySchema,
  ProcessedRepoSearchResult,
} from '../scheme/github_search_repos';
import type { Repository } from '../github/github-openapi';
import { ensureUniqueQueryIds } from '../utils/bulkOperations';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from '../utils/bulkOperations';
import { generateHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

const DESCRIPTION = `Search GitHub repositories with smart filtering and bulk operations.

KEY FEATURES:
- Bulk queries: Execute up to 5 searches in parallel for comprehensive discovery
- use both topics specific query and terms specific query for better results
- query with both topics and terms is not good for exploration
- Quality filters: Stars, forks, activity (commits, issues, pull requests),last updated, update frequency

SEARCH STRATEGIES:
- for specific repositorry search with limit of 1 and get most relevant repository
- Exploration: Use bulk search with several search directions`;

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

export function registerSearchGitHubReposTool(server: McpServer) {
  return server.registerTool(
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
      async (
        args: {
          queries: GitHubReposSearchQuery[];
          verbose?: boolean;
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one search query with search terms or filters',
            ],
          });

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
            hasResults: false,
            errorMessage: 'Too many queries provided',
            customHints: [
              'Limit to 5 queries per request for optimal performance',
            ],
          });

          return createResult({
            isError: true,
            error: 'Maximum 5 queries allowed per request',
            hints,
          });
        }

        return searchMultipleGitHubRepos(
          args.queries,
          args.verbose || false,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  verbose: boolean = false,
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'repo-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubReposSearchQuery
    ): Promise<ProcessedRepoSearchResult> => {
      try {
        const apiResult = await searchGitHubReposAPI(
          query,
          authInfo,
          userContext
        );

        if ('error' in apiResult) {
          // Generate hints for this specific query error
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
            hasResults: false,
            errorMessage: apiResult.error,
            researchGoal:
              typeof query.researchGoal === 'string'
                ? query.researchGoal
                : undefined,
          });

          return {
            error: apiResult.error,
            hints,
            metadata: {
              queryArgs: { ...query },
              error: apiResult.error,
              researchGoal:
                typeof query.researchGoal === 'string'
                  ? query.researchGoal
                  : 'discovery',
            },
          };
        }

        // Extract repository data
        const repositories = apiResult.data.repositories || [];
        const hasResults =
          repositories.length > 0 && (apiResult.data.total_count || 0) > 0;

        const typedRepositories = repositories as unknown as Repository[];

        return {
          repositories: typedRepositories,
          total_count: apiResult.data.total_count,
          metadata: {
            // Always include queryArgs for no-result cases (handled by bulk operations)
            ...(hasResults ? {} : { queryArgs: { ...query } }),
            searchType: 'success',
            researchGoal:
              typeof query.researchGoal === 'string'
                ? query.researchGoal
                : 'discovery',
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const hints = generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          hasResults: false,
          errorMessage,
          researchGoal:
            typeof query.researchGoal === 'string'
              ? query.researchGoal
              : undefined,
        });

        return {
          error: errorMessage,
          hints,
          metadata: {
            queryArgs: { ...query },
            error: errorMessage,
            researchGoal:
              typeof query.researchGoal === 'string'
                ? query.researchGoal
                : 'discovery',
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
      hasResults: results.some(r => {
        if (r.result.error) return false;
        const result = r.result as { repositories?: Repository[] };
        return result.repositories && result.repositories.length > 0;
      }),
      hasPopularRepos: false,
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (!result.error) {
      const res = result as { repositories?: Repository[] };
      if (res.repositories && Array.isArray(res.repositories)) {
        const repositories = res.repositories;
        repositories.forEach((repo: Repository) => {
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
      }

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
    uniqueQueries,
    verbose
  );
}

// End of searchMultipleGitHubRepos function
