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

        // Check if any query has verbose=true
        const hasVerboseQuery = args.queries.some(q => q.verbose === true);

        return searchMultipleGitHubRepos(
          args.queries,
          hasVerboseQuery,
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

  // Create response with enhanced hints
  const response = createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries,
    verbose
  );

  // Apply verbose filtering and flatten complex structures
  const responseText = response.content[0]?.text;
  if (!responseText || typeof responseText !== 'string') {
    return response;
  }
  const responseData = JSON.parse(responseText);
  if (responseData.results) {
    responseData.results = responseData.results.map(
      (result: Record<string, unknown>, index: number) => {
        const hasError = !!result.error;
        const hasNoResults =
          result.repositories &&
          (result.repositories as unknown[]).length === 0;

        // If this specific query has verbose=true, add query field
        const originalQuery = uniqueQueries[index];
        const queryIsVerbose = originalQuery?.verbose === true;

        // Flatten metadata.queryArgs to query field when appropriate
        if (result.metadata && typeof result.metadata === 'object') {
          const metadata = result.metadata as Record<string, unknown>;
          if (metadata.queryArgs) {
            if (hasError || hasNoResults || queryIsVerbose) {
              result.query = metadata.queryArgs;
            }
            // Remove complex nested metadata structure only if not verbose
            if (!queryIsVerbose) {
              delete result.metadata;
            }
          }
        }

        if (queryIsVerbose && !result.query) {
          if (originalQuery) {
            result.query = { ...originalQuery };
          } else {
            // Fallback: create query from result data
            result.query = {
              id: result.queryId,
              verbose: true,
            };
          }
        }

        return result;
      }
    );
  }

  // Update the response content
  response.content = [
    { type: 'text', text: JSON.stringify(responseData, null, 2) },
  ];

  return response;
}

// End of searchMultipleGitHubRepos function
