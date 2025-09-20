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
          repositories: typedRepositories,
          total_count: apiResult.data.total_count,
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
        const repoResult = r.result as ProcessedRepoSearchResult;
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
    includeAggregatedContext: verbose,
    includeErrors: true,
    maxHints: 8,
  };

  // Add query field for failed queries, no results cases, or when verbose is true
  const processedResults = results.map(({ result }, index) => {
    const repoResult = result as ProcessedRepoSearchResult;
    const hasError = !!repoResult.error;
    const hasNoResults =
      repoResult.repositories && repoResult.repositories.length === 0;

    if (hasError || hasNoResults || verbose) {
      // Find the original query for this result
      const originalQuery = uniqueQueries[index];
      if (originalQuery) {
        // Add query field to the result itself
        repoResult.query = { ...originalQuery };
      }
    }
    return repoResult;
  });

  return createBulkResponse(
    config,
    processedResults.map(result => ({ result })),
    aggregatedContext,
    errors,
    uniqueQueries,
    verbose
  );
}

// End of searchMultipleGitHubRepos function
