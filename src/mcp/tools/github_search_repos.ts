import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { GitHubReposSearchParams } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  generateSmartHints,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { searchGitHubReposAPI } from '../../utils/githubAPI';
import {
  GitHubReposSearchQuery,
  GitHubReposSearchQueryResult,
  GitHubReposSearchQuerySchema,
  GitHubReposSearchResult,
} from './scheme/github_search_repos';

const DESCRIPTION = `Search GitHub repositories - Use bulk queries to find repositories with different search criteria in parallel for optimization

Search strategy:
  Use limit=1 on queries as a default (e.g. when searching specific repository)
  Use larget limit for exploratory search (e.g. when searching by topic, language, owner, or keyword)
  If cannot find repository, consider using ${TOOL_NAMES.PACKAGE_SEARCH} tool`;

export function registerSearchGitHubReposTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubReposSearchQuerySchema)
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different search queries for sequential execution. Use several queries to get more results in one tool call'
          ),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include detailed metadata for debugging. Default: false for cleaner responses'
          ),
      },
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: {
      queries: GitHubReposSearchQuery[];
      verbose?: boolean;
    }): Promise<CallToolResult> => {
      try {
        return await searchMultipleGitHubRepos(
          args.queries,
          args.verbose ?? false,
          opts
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return createResult({
          isError: true,
          hints: [
            `Failed to search repositories: ${errorMessage}. Try broader search terms or check repository access.`,
          ],
        });
      }
    }
  );
}

function validateRepositoryQuery(
  query: GitHubReposSearchQuery,
  queryId: string
): { isValid: boolean; error?: string } {
  // Just check that we have at least one search parameter
  const hasAnyParam = !!(
    query.exactQuery ||
    (query.queryTerms && query.queryTerms.length > 0) ||
    query.owner ||
    query.language ||
    query.topic
  );

  if (!hasAnyParam) {
    return {
      isValid: false,
      error: `Query ${queryId}: At least one search parameter required`,
    };
  }

  return { isValid: true };
}

/**
 * Processes a single query with proper error handling
 * @param query The query to process
 * @param queryId The query identifier
 * @param opts Tool options for API configuration
 * @returns Promise resolving to query result
 */
async function processSingleQuery(
  query: GitHubReposSearchQuery,
  queryId: string,
  opts: ToolOptions = { npmEnabled: false }
): Promise<GitHubReposSearchQueryResult> {
  try {
    // Validate query
    const validation = validateRepositoryQuery(query, queryId);
    if (!validation.isValid) {
      return {
        queryId,
        result: { total_count: 0, repositories: [] },
        error: validation.error,
      };
    }

    // Use query parameters directly without modification, filter out null values
    const enhancedQuery: GitHubReposSearchParams = Object.fromEntries(
      Object.entries(query).filter(
        ([_, value]) => value !== null && value !== undefined
      )
    ) as GitHubReposSearchParams;

    // Execute API search using Octokit only
    const apiResult = await Promise.allSettled([
      searchGitHubReposAPI(enhancedQuery, opts.ghToken),
    ]).then(results => results[0]);

    // Process the API result
    if (apiResult.status === 'fulfilled') {
      const result = apiResult.value;
      return {
        queryId,
        result: result.data || { total_count: 0, repositories: [] },
        error: result.isError ? result.hints?.join(', ') : undefined,
      };
    } else {
      return {
        queryId,
        result: { total_count: 0, repositories: [] },
        error: `API error: ${apiResult.reason}`,
      };
    }
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      queryId,
      result: { total_count: 0, repositories: [] },
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  verbose: boolean = false,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const results: GitHubReposSearchQueryResult[] = [];

  // Execute queries sequentially (simple and reliable)
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    const result = await processSingleQuery(query, queryId, opts);
    results.push(result);
  }

  // Collect all repositories from successful queries (both CLI and API)
  const allRepositories: GitHubReposSearchResult['repositories'] = [];
  results.forEach(result => {
    // Add CLI results
    if (!result.error && result.result.repositories) {
      allRepositories.push(...result.result.repositories);
    }
    // Add API results
    if (!result.apiError && result.apiResult?.repositories) {
      allRepositories.push(...result.apiResult.repositories);
    }
  });

  // Generate hints using centralized system
  const errorMessages = results
    .filter(r => r.error || r.apiError)
    .map(r => r.error || r.apiError!);
  const errorMessage = errorMessages.length > 0 ? errorMessages[0] : undefined;

  const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, {
    hasResults: allRepositories.length > 0,
    totalItems: allRepositories.length,
    errorMessage,
  });

  // Add research goal hints if we have successful results
  const researchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  if (researchGoal && allRepositories.length > 0) {
    const goalHints = getResearchGoalHints(
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      researchGoal
    );
    hints.push(...goalHints);
  }

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(r => !r.error).length;
  const successfulApiQueries = results.filter(
    r => !r.apiError && r.apiResult
  ).length;
  const totalRepositories = allRepositories.length;

  // Extract API results for separate section
  const apiResults = results.map(result => ({
    queryId: result.queryId,
    data: result.apiResult || { total_count: 0, repositories: [] },
    error: result.apiError,
  }));

  let responseData:
    | {
        data: typeof allRepositories;
        apiResults: typeof apiResults;
        hints: string[];
      }
    | {
        data: typeof allRepositories;
        apiResults: typeof apiResults;
        hints: string[];
        metadata: object;
      } = {
    data: allRepositories,
    apiResults,
    hints,
  };

  // Add metadata only if verbose mode is enabled
  if (verbose) {
    const failedQueries = results.filter(r => r.error).length;
    const failedApiQueries = results.filter(r => r.apiError).length;

    responseData = {
      data: allRepositories,
      apiResults,
      hints,
      metadata: {
        queries: results,
        summary: {
          totalQueries,
          cli: {
            successfulQueries,
            failedQueries,
          },
          api: {
            successfulQueries: successfulApiQueries,
            failedQueries: failedApiQueries,
          },
          totalRepositories,
        },
      },
    };
  }

  return createResult({
    data: responseData,
  });
}
