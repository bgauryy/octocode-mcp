import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubCodeAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
  ProcessedCodeSearchResult,
} from './scheme/github_search_code';
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
Search GitHub code with progressive refinement and comprehensive coverage.

This tool uses intelligent query processing to find code implementations, examples, 
and patterns across GitHub repositories. It supports bulk operations for efficient 
multi-query research and provides smart suggestions for query optimization.

Key Features:
- Progressive refinement: Start broad, then narrow focus based on findings
- Multi-repository analysis: Compare implementations across projects
- Context-aware suggestions: Smart recovery from failed searches
- Research goal optimization: Tailored hints based on your research intent

Best Practices:
- Use specific search terms for targeted results
- Combine with repository structure exploration for complete understanding
- Leverage research goals (discovery, code_generation, debugging) for optimal guidance
`;

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

export function registerGitHubSearchCodeTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
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
      async (args: {
        queries: GitHubCodeSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, {
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
          const hints = generateToolHints(TOOL_NAMES.GITHUB_SEARCH_CODE, {
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
          opts
        );
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  verbose: boolean = false,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'code-search');

  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubCodeSearchQuery
    ): Promise<ProcessedCodeSearchResult> => {
      try {
        const apiResult = await searchGitHubCodeAPI(query, opts.ghToken);

        if ('error' in apiResult) {
          // Generate smart suggestions for this specific query error
          const smartSuggestions = generateSmartSuggestions(
            TOOL_SUGGESTION_CONFIGS.github_search_code,
            apiResult.error,
            query
          );

          return {
            queryId: query.id!,
            success: false,
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

        // Extract repository context
        const repository =
          apiResult.repository?.name ||
          (apiResult.items.length > 0
            ? apiResult.items[0].repository.nameWithOwner
            : undefined);

        // Count total matches across all files
        const totalMatches = apiResult.items.reduce(
          (sum, item) => sum + item.matches.length,
          0
        );

        // Check if there are no results
        const hasNoResults = apiResult.items.length === 0;

        const result = {
          queryId: query.id!,
          success: true,
          data: {
            repository,
            files: apiResult.items.map(item => ({
              path: item.path,
              text_matches: item.matches.map(match => match.context),
            })),
            totalCount: apiResult.total_count,
          },
          metadata: {
            researchGoal: query.researchGoal || 'discovery',
            resultCount: apiResult.items.length,
            hasMatches: totalMatches > 0,
            repositories: repository ? [repository] : [],
          },
        };

        // Add searchType and hints for no results case
        if (hasNoResults) {
          (result.metadata as any).searchType = 'no_results';

          // Generate specific hints for no results
          const noResultsHints = [
            'Try broader search terms or remove specific filters',
            'Search in a different repository or expand to multiple repositories',
            'Use repository search first to find relevant projects',
            'Consider searching for related concepts or alternative implementations',
          ];

          // Add repository-specific hints if searching in a specific repo
          if (query.owner && query.repo) {
            noResultsHints.unshift(
              `No results found in ${query.owner}/${query.repo} - try searching across all repositories`
            );
          }

          (result as any).hints = noResultsHints;
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const smartSuggestions = generateSmartSuggestions(
          TOOL_SUGGESTION_CONFIGS.github_search_code,
          errorMessage,
          query
        );

        return {
          queryId: query.id!,
          success: false,
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
  const successfulCount = results.filter(r => r.result.success).length;
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
          r.result.success &&
          r.result.data?.files &&
          r.result.data.files.length > 0
      ),
      hasMatches: results.some(
        r => r.result.success && r.result.metadata?.hasMatches
      ),
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (result.success) {
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
      const queryTerms = result.metadata?.queryArgs?.queryTerms || [];
      queryTerms.forEach((term: string) =>
        aggregatedContext.searchPatterns.add(term)
      );
    }
  });

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
    includeAggregatedContext: verbose,
    includeErrors: true,
    maxHints: 8,
  };

  // Add queryArgs to metadata for failed queries or when verbose is true
  const processedResults = results.map(({ queryId, result }) => {
    if (!result.success || verbose) {
      // Find the original query for this result
      const originalQuery = uniqueQueries.find(q => q.id === queryId);
      if (originalQuery && result.metadata) {
        result.metadata.queryArgs = originalQuery;
      }
    }
    return { queryId, result };
  });

  return createBulkResponse(
    config,
    processedResults,
    aggregatedContext,
    errors,
    uniqueQueries
  );
}
