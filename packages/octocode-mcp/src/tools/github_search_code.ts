import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

import { createResult } from '../mcp/responses.js';
import { TOOL_NAMES } from './utils/toolConstants.js';
import { withSecurityValidation } from './utils/withSecurityValidation.js';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
} from './scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/index.js';
import {
  createBulkResponse,
  BulkResponseConfig,
  processBulkQueries,
} from './utils/bulkOperations.js';
import {
  generateHints,
  generateBulkHints,
  consolidateHints,
} from './utils/hints_consolidated.js';
import { ensureUniqueQueryIds } from './utils/bulkOperations.js';
import { ProcessedCodeSearchResult } from './scheme/github_search_code.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import type { OptimizedCodeSearchResult } from '../types/github-openapi.js';

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with strategic query planning.

  SEARCH STRATEGY:
    SEMANTIC: Natural language terms describing functionality, concepts, business logic
    TECHNICAL: Actual code terms, function names, class names, file patterns
    Use bulk queries from different angles. Start narrow, broaden if needed
    SEPERATE SEARCH SMART USING SEVERAL QUERIES IN BULK
    USE STRINGS WITH ONE WORD ONLY FOR EXPLORETORY SEARCH.
      EXAMPLE:
        queryTerms: [
            term1,
            term2
          ]
  FOR MORE CONTEXT AFTER GOOD FINDINGS:
        Use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} with matchString for context.
        Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to find the repository structure for relevant files after search

  Progressive queries: Core terms → Specific patterns → Documentation → Configuration → Alternatives`;

interface GitHubCodeAggregatedContext {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  foundPackages: Set<string>;
  foundFiles: Set<string>;
  repositoryContexts: Set<string>;
  searchPatterns: Set<string>;
  dataQuality: {
    hasResults: boolean;
    hasContent: boolean;
    hasMatches: boolean;
  };
}

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTION,
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

        // Log enterprise access if configured
        if (userContext?.isEnterpriseMode) {
          try {
            const { logToolEvent } = await import('../security/auditLogger.js');
            logToolEvent(TOOL_NAMES.GITHUB_SEARCH_CODE, 'success', {
              userId: userContext.userId,
              userLogin: userContext.userLogin,
              organizationId: userContext.organizationId,
              queryCount: args.queries.length,
              queryTerms: args.queries.map(q => q.queryTerms).flat(),
            });
          } catch {
            // Ignore audit logging errors
          }
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
  _userContext?: import('./utils/withSecurityValidation').UserContext
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'code-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubCodeSearchQuery
    ): Promise<ProcessedCodeSearchResult> => {
      try {
        const apiResult = await searchGitHubCodeAPI(query, authInfo);

        if ('error' in apiResult) {
          // Generate smart suggestions for this specific query error
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
            hasResults: false,
            errorMessage: apiResult.error,
            researchGoal: query.researchGoal,
          });

          return {
            queryId: query.id!,
            error: apiResult.error,
            hints: hints,
            metadata: {
              queryArgs: { ...query },
              error: apiResult.error,
              hints: hints,
              researchGoal: query.researchGoal || 'discovery',
            },
          };
        }

        // Extract repository context
        const repository =
          apiResult.data.repository?.name ||
          (apiResult.data.items.length > 0 &&
          apiResult.data.items[0]?.repository?.nameWithOwner
            ? apiResult.data.items[0].repository.nameWithOwner
            : undefined);

        // Count total matches across all files
        const totalMatches = apiResult.data.items.reduce(
          (sum: number, item: OptimizedCodeSearchResult['items'][0]) =>
            sum + item.matches.length,
          0
        );

        // Check if there are no results
        const hasNoResults = apiResult.data.items.length === 0;

        const result = {
          queryId: query.id!,
          data: {
            repository,
            files: apiResult.data.items.map(
              (item: OptimizedCodeSearchResult['items'][0]) => ({
                path: item.path,
                // text_matches contain actual file content processed through the same
                // content optimization pipeline as file fetching (sanitization, minification)
                text_matches: item.matches.map(
                  (
                    match: OptimizedCodeSearchResult['items'][0]['matches'][0]
                  ) => match.context
                ),
              })
            ),
            totalCount: apiResult.data.total_count,
          },
          metadata: {
            researchGoal: query.researchGoal || 'discovery',
            resultCount: apiResult.data.items.length,
            hasMatches: totalMatches > 0,
            repositories: repository ? [repository] : [],
          },
        };

        // Add searchType and hints for no results case
        if (hasNoResults) {
          (result.metadata as Record<string, unknown>).searchType =
            'no_results';
          (result.metadata as Record<string, unknown>).queryArgs = { ...query };

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

          (result as Record<string, unknown>).hints = noResultsHints;
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const hints = generateHints({
          toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
          hasResults: false,
          errorMessage: errorMessage,
          researchGoal: query.researchGoal,
        });

        return {
          queryId: query.id!,
          error: errorMessage,
          hints: hints,
          metadata: {
            queryArgs: { ...query },
            error: errorMessage,
            hints: hints,
            researchGoal: query.researchGoal || 'discovery',
          },
        };
      }
    }
  );

  // Build aggregated context for intelligent hints
  const successfulCount = results.filter(r => !r.result.error).length;
  const aggregatedContext: GitHubCodeAggregatedContext = {
    totalQueries: results.length,
    successfulQueries: successfulCount,
    failedQueries: results.length - successfulCount,
    foundPackages: new Set<string>(),
    foundFiles: new Set<string>(),
    repositoryContexts: new Set<string>(),
    searchPatterns: new Set<string>(),
    dataQuality: {
      hasResults: successfulCount > 0,
      hasContent: results.some(
        r =>
          !r.result.error &&
          r.result.data?.files &&
          r.result.data.files.length > 0
      ),
      hasMatches: results.some(
        r => !r.result.error && r.result.metadata?.hasMatches
      ),
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (!result.error) {
      if (result.data?.repository) {
        aggregatedContext.repositoryContexts.add(result.data.repository);
      }

      // Extract file paths for structure hints
      if (result.data?.files) {
        result.data.files.forEach(file => {
          aggregatedContext.foundFiles.add(file.path);
        });
      }

      // Extract search patterns from query terms
      const queryArgs = result.metadata?.queryArgs as
        | Record<string, unknown>
        | undefined;
      const queryTerms = (queryArgs?.queryTerms as string[]) || [];
      queryTerms.forEach((term: string) =>
        aggregatedContext.searchPatterns.add(term)
      );
    }
  });

  // Generate enhanced hints for research capabilities
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

  // Add queryArgs to metadata for failed queries, no results cases, or when verbose is true
  const processedResults = results.map(({ queryId, result }) => {
    const hasError = !!result.error;
    const hasNoResults = result.metadata?.searchType === 'no_results';

    if (hasError || hasNoResults || verbose) {
      // Find the original query for this result
      const originalQuery = uniqueQueries.find(q => q.id === queryId);
      if (originalQuery && result.metadata) {
        // Ensure we're setting the actual object, not a stringified version
        result.metadata.queryArgs = { ...originalQuery };
      }
    }
    return { queryId, result };
  });

  // Create response with enhanced hints
  const response = createBulkResponse(
    config,
    processedResults,
    aggregatedContext,
    errors,
    uniqueQueries
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

    // Create new response with enhanced hints
    return createResult({
      data: responseData.data,
      meta: responseData.meta as Record<string, unknown> | undefined,
      hints: combinedHints,
      isError: response.isError,
    });
  }

  return response;
}
