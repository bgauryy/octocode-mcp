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
  RepoSearchResult,
  SimplifiedRepository,
} from '../scheme/github_search_repos';
import { ensureUniqueQueryIds } from '../utils/bulkOperations';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
  ProcessedBulkResult,
} from '../utils/bulkOperations';
import { generateHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';

// Simplified aggregated context
interface AggregatedRepoContext {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  dataQuality: {
    hasResults: boolean;
  };
}

export function registerSearchGitHubReposTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES],
      inputSchema: GitHubReposSearchQuerySchema.shape,
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (
        args: {
          queries: GitHubReposSearchQuery[];
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
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        return searchMultipleGitHubRepos(args.queries, authInfo, userContext);
      }
    )
  );
}

/**
 * Expands queries that have both topicsToSearch and keywordsToSearch into separate queries
 * This improves search effectiveness by allowing each search type to be optimized independently
 */
function expandQueriesWithBothSearchTypes(
  queries: GitHubReposSearchQuery[]
): GitHubReposSearchQuery[] {
  const expandedQueries: GitHubReposSearchQuery[] = [];

  queries.forEach((query, index) => {
    const hasTopics =
      query.topicsToSearch &&
      (Array.isArray(query.topicsToSearch)
        ? query.topicsToSearch.length > 0
        : query.topicsToSearch);
    const hasKeywords =
      query.keywordsToSearch && query.keywordsToSearch.length > 0;

    if (hasTopics && hasKeywords) {
      // Split into two queries: one for topics, one for keywords
      const baseQuery = { ...query };
      delete baseQuery.topicsToSearch;
      delete baseQuery.keywordsToSearch;

      // Topics-based query
      const topicsQuery: GitHubReposSearchQuery = {
        ...baseQuery,
        id: query.id ? `${query.id}_topics` : `query_${index}_topics`,
        reasoning: query.reasoning
          ? `${query.reasoning} (topics-based search)`
          : 'Topics-based repository search',
        topicsToSearch: query.topicsToSearch,
      };

      // Keywords-based query
      const keywordsQuery: GitHubReposSearchQuery = {
        ...baseQuery,
        id: query.id ? `${query.id}_keywords` : `query_${index}_keywords`,
        reasoning: query.reasoning
          ? `${query.reasoning} (keywords-based search)`
          : 'Keywords-based repository search',
        keywordsToSearch: query.keywordsToSearch,
      };

      expandedQueries.push(topicsQuery, keywordsQuery);
    } else {
      // Keep original query if it doesn't have both search types
      expandedQueries.push(query);
    }
  });

  return expandedQueries;
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  // Split queries that have both topicsToSearch and keywordsToSearch
  const expandedQueries = expandQueriesWithBothSearchTypes(queries);
  const uniqueQueries = ensureUniqueQueryIds(expandedQueries, 'repo-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (query: GitHubReposSearchQuery): Promise<ProcessedBulkResult> => {
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
          });

          return {
            queryId: query.id,
            reasoning: query.reasoning,
            error: apiResult.error,
            hints,
            metadata: {},
          } as ProcessedBulkResult;
        }

        // Extract repository data
        const repositories = apiResult.data.repositories || [];
        const typedRepositories =
          repositories as unknown as SimplifiedRepository[];

        return {
          queryId: query.id,
          reasoning: query.reasoning,
          repositories: typedRepositories,
          metadata: {},
        } as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const hints = generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          hasResults: false,
          errorMessage,
        });

        return {
          queryId: query.id,
          reasoning: query.reasoning,
          error: errorMessage,
          hints,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  const successfulCount = results.filter(r => !r.result.error).length;
  const aggregatedContext: AggregatedRepoContext = {
    totalQueries: results.length,
    successfulQueries: successfulCount,
    failedQueries: results.length - successfulCount,
    dataQuality: {
      hasResults: results.some(r => {
        const repoResult = r.result as RepoSearchResult;
        return (
          !repoResult.error &&
          repoResult.repositories &&
          repoResult.repositories.length > 0
        );
      }),
    },
  };

  // No need to extract detailed context - keep it simple

  // Hints are now generated automatically by createBulkResponse

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    maxHints: 8,
    keysPriority: [
      'queryId',
      'reasoning',
      'repository',
      'description',
      'url',
      'stars',
      'updatedAt',
    ],
  };

  // Create standardized response - bulk operations handles all hint generation and formatting
  return createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries
  );
}

// End of searchMultipleGitHubRepos function
