import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

import { createResult } from '../responses.js';
import { TOOL_NAMES } from '../constants.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
} from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/index.js';
import {
  createBulkResponse,
  BulkResponseConfig,
  processBulkQueries,
  ProcessedBulkResult,
} from '../utils/bulkOperations.js';
import { generateHints, generateBulkHints, consolidateHints } from './hints.js';
import { ensureUniqueQueryIds } from '../utils/bulkOperations.js';
import { ProcessedCodeSearchResult } from '../scheme/github_search_code.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import type { OptimizedCodeSearchResult } from '../github/github-openapi.js';
import { DESCRIPTIONS } from './descriptions.js';

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
        args: {
          queries: GitHubCodeSearchQuery[];
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
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: ['Provide at least one search query with queryTerms'],
          });

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
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
        return searchMultipleGitHubCode(
          args.queries,
          args.verbose || false,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  verbose: boolean = false,
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

        // Check if there are no results
        const hasNoResults = apiResult.data.items.length === 0;

        const result: ProcessedCodeSearchResult = {
          repository,
          files: apiResult.data.items.map(
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
          totalCount: apiResult.data.total_count,
          metadata: {}, // Always include metadata for bulk operations compatibility
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

  // Generate simple bulk hints
  const enhancedHints = generateBulkHints({
    toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
    hasResults: successfulCount > 0,
    errorCount: results.length - successfulCount,
    totalCount: uniqueQueries.length,
    successCount: successfulCount,
  });

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
    includeAggregatedContext: verbose,
    includeErrors: true,
    maxHints: 8,
  };

  // Add query field for failed queries, no results cases, or when verbose is true
  const processedResults = results.map(({ result }, index) => {
    const codeResult = result as ProcessedCodeSearchResult;
    const hasError = !!codeResult.error;
    const hasNoResults = codeResult.files && codeResult.files.length === 0;

    if (hasError || hasNoResults || verbose) {
      // Find the original query for this result
      const originalQuery = uniqueQueries[index]; // Use index since we removed queryId
      if (originalQuery) {
        // Add query field to the result itself
        codeResult.query = { ...originalQuery };
      }
    }
    return codeResult;
  });

  // Create response with enhanced hints
  const response = createBulkResponse(
    config,
    processedResults.map(result => ({ result })),
    aggregatedContext,
    errors,
    uniqueQueries,
    verbose
  );

  // Enhance hints with research-specific guidance
  if (enhancedHints.length > 0) {
    // Extract the current hints from the response content
    const responseText = response.content[0]?.text || '';
    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText as string);
    } catch {
      // If parsing fails, return response as is
      return response;
    }

    // Combine enhanced hints with existing hints
    const existingHints = (responseData.hints as string[]) || [];
    const combinedHints = consolidateHints(
      [...enhancedHints, ...existingHints],
      8
    );

    // Create new response with enhanced hints using consistent bulk format
    const newResponseData: Record<string, unknown> = {
      results: responseData.results, // Use 'results' field from bulk response
      hints: combinedHints,
    };

    // Add meta if it exists
    if (responseData.meta) {
      newResponseData.meta = responseData.meta;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(newResponseData, null, 2),
        },
      ],
      isError: response.isError,
    };
  }

  return response;
}
