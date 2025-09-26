import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

import { createResult } from '../responses.js';
import { TOOL_NAMES } from '../constants.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
  GitHubSearchCodeInput,
  SearchResult,
} from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/index.js';
import {
  createBulkResponse,
  BulkResponseConfig,
  processBulkQueries,
  ProcessedBulkResult,
} from '../utils/bulkOperations.js';
import { generateHints } from './hints.js';
import { ensureUniqueQueryIds } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import type { OptimizedCodeSearchResult } from '../github/github-openapi.js';
import { DESCRIPTIONS } from './descriptions.js';
import { shouldIgnoreFile } from '../utils/fileFilters.js';

export function registerGitHubSearchCodeTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema.shape,
      annotations: {
        title: 'GitHub Code Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (
        args: Record<string, unknown>,
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        // Type assertion after validation
        const typedArgs = args as unknown as GitHubSearchCodeInput;
        if (
          !typedArgs.queries ||
          !Array.isArray(typedArgs.queries) ||
          typedArgs.queries.length === 0
        ) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one search query with keywordsToSearch',
            ],
          });

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        return searchMultipleGitHubCode(
          typedArgs.queries,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: import('../security/withSecurityValidation.js').UserContext
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'code-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubCodeSearchQuery & { id: string }
    ): Promise<ProcessedBulkResult> => {
      try {
        const apiResult = await searchGitHubCodeAPI(
          query,
          authInfo,
          userContext?.sessionId
        );

        if ('error' in apiResult) {
          // Generate smart suggestions for this specific query error
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
            hasResults: false,
            errorMessage: apiResult.error,
          });

          return {
            queryId: query.id,
            reasoning: query.reasoning,
            error: apiResult.error,
            hints: hints,
            metadata: {},
          } as ProcessedBulkResult;
        }

        // Extract repository context
        const repository =
          apiResult.data.repository?.name ||
          (apiResult.data.items.length > 0 &&
          apiResult.data.items[0]?.repository?.nameWithOwner
            ? apiResult.data.items[0].repository.nameWithOwner
            : undefined);

        // Filter out ignored files from results - additional filtering at tool level
        const filteredItems = apiResult.data.items.filter(
          (item: OptimizedCodeSearchResult['items'][0]) =>
            !shouldIgnoreFile(item.path)
        );

        // Check if there are no results after filtering
        const hasNoResults = filteredItems.length === 0;

        const result: SearchResult = {
          queryId: query.id,
          reasoning: query.reasoning,
          repository,
          files: filteredItems.map(
            (item: OptimizedCodeSearchResult['items'][0]) => ({
              path: item.path,
              // text_matches contain actual file content processed through the same
              // content optimization pipeline as file fetching (sanitization, minification)
              text_matches: item.matches.map(
                (match: OptimizedCodeSearchResult['items'][0]['matches'][0]) =>
                  match.context
              ),
            })
          ),
          metadata: {},
        };

        // Add hints for no results case
        if (hasNoResults) {
          // Generate specific hints for no results
          const noResultsHints = [
            'Use broader search terms',
            'Try repository search first',
            'Consider related concepts',
          ];

          // Add repository-specific hints if searching in a specific repo
          if (query.owner && query.repo) {
            noResultsHints.unshift(
              `No results found in ${query.owner}/${query.repo} - try searching across all repositories`
            );
          }

          result.hints = noResultsHints;
        }

        return result as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const hints = generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
          hasResults: false,
          errorMessage: errorMessage,
        });

        return {
          queryId: query.id,
          reasoning: query.reasoning,
          error: errorMessage,
          hints: hints,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  const successfulCount = results.filter(r => !r.result.error).length;
  const aggregatedContext = {
    totalQueries: results.length,
    successfulQueries: successfulCount,
    failedQueries: results.length - successfulCount,
    dataQuality: { hasResults: successfulCount > 0 },
  };

  // No need to extract detailed context - keep it simple

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
    maxHints: 8,
    keysPriority: ['queryId', 'reasoning', 'repository', 'files'],
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
