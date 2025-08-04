import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubCodeAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import { logger } from '../../utils/logger';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
  ProcessedCodeSearchResult,
} from './scheme/github_search_code';
import { ensureUniqueQueryIds } from './utils/queryUtils';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from './utils/bulkOperations';
import {
  generateToolHints,
  generateSmartSuggestions,
  generateResearchSpecificHints,
  TOOL_SUGGESTION_CONFIGS,
} from './utils/hints_consolidated';

const DESCRIPTION = `Search code across GitHub repositories with semantic and pattern matching for comprehensive research.

Primary research tool for discovering code patterns, implementations, and documentation.
Supports semantic search (concept-based) and pattern search (exact matches) with progressive
refinement capabilities. Use this tool to start research, then dive deeper with other tools.

RESEARCH PHASES:
- **Discovery**: Broad semantic searches to understand landscape
- **Analysis**: Pattern-based searches for specific implementations
- **Validation**: Cross-reference findings with other tools

FEATURES:
- Semantic search: Find code by concepts and functionality
- Pattern matching: Exact code pattern and syntax search
- Progressive refinement: Start broad, then narrow focus
- Bulk operations: Execute up to 5 search queries simultaneously
- Content extraction: Returns actual code snippets with context
- Research optimization: Tailored results based on research goals

STRATEGIC USAGE:
- **Discovery Phase**: Start with broad semantic searches (queryTerms)
- **Analysis Phase**: Use exact patterns (exactQuery) for specific implementations
- **Validation Phase**: Cross-reference with ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for complete context
- **Navigation**: Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to understand project organization
- **Bulk Strategy**: Leverage multiple queries for comprehensive coverage

BEST PRACTICES:
- Start with broad semantic searches, then refine with specific patterns
- Use queryTerms for concept search, exactQuery for precise patterns
- Combine with ${TOOL_NAMES.GITHUB_FETCH_CONTENT} to get complete file context
- Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to understand project organization
- Leverage bulk operations for comprehensive coverage of research topics
- Follow hints for optimal tool chaining and deeper research paths`;

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
        // Debug logging to see what we receive
        logger.debug('GitHub search code tool received args', {
          args: JSON.stringify(args, null, 2),
          queriesType: typeof args.queries,
          queriesIsArray: Array.isArray(args.queries),
          firstQueryType: args.queries?.[0]
            ? typeof args.queries[0]
            : 'undefined',
          firstQueryStringified: args.queries?.[0]
            ? JSON.stringify(args.queries[0])
            : 'undefined',
        });
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
            TOOL_SUGGESTION_CONFIGS.githubSearchCode,
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
              hints: smartSuggestions.hints,
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
          data: {
            repository,
            files: apiResult.items.map(item => ({
              path: item.path,
              // text_matches contain actual file content processed through the same
              // content optimization pipeline as file fetching (sanitization, minification)
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
          (result.metadata as any).queryArgs = { ...query };

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

          (result as any).hints = noResultsHints;
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const smartSuggestions = generateSmartSuggestions(
          TOOL_SUGGESTION_CONFIGS.githubSearchCode,
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
            hints: smartSuggestions.hints,
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
      const queryTerms = result.metadata?.queryArgs?.queryTerms || [];
      queryTerms.forEach((term: string) =>
        aggregatedContext.searchPatterns.add(term)
      );
    }
  });

  // Generate enhanced hints for research capabilities
  const researchGoal = uniqueQueries[0]?.researchGoal || 'discovery';
  const enhancedHints = generateResearchSpecificHints(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    researchGoal as any,
    {
      hasResults: successfulCount > 0,
      totalItems: successfulCount,
      findings: results.filter(r => !r.result.error).map(r => r.result.data),
      queryContext: {
        queryTerms: uniqueQueries[0]?.queryTerms,
        language: uniqueQueries[0]?.language,
        owner: uniqueQueries[0]?.owner,
        repo: uniqueQueries[0]?.repo,
      },
    }
  );

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
    let responseData;
    try {
      responseData = JSON.parse(responseText as string);
    } catch {
      // If parsing fails, return response as is
      return response;
    }

    // Combine enhanced hints with existing hints
    const existingHints = responseData.hints || [];
    const combinedHints = [...enhancedHints, ...existingHints].slice(0, 8);

    // Create new response with enhanced hints
    return createResult({
      data: responseData.data,
      meta: responseData.meta,
      hints: combinedHints,
      isError: response.isError,
    });
  }

  return response;
}
