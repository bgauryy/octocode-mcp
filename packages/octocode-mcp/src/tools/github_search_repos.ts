import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  UserContext,
  ToolInvocationCallback,
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from '../types.js';
import { searchGitHubReposAPI } from '../github/repoSearch.js';
import { TOOL_NAMES } from '../constants.js';
import { GitHubReposSearchQuerySchema } from '../scheme/github_search_repos.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { DESCRIPTIONS } from './descriptions.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerSearchGitHubReposTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
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
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      async (
        args: {
          queries: GitHubReposSearchQuery[];
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        // Invoke callback if provided
        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, queries);
          } catch {
            // Silently ignore callback errors
          }
        }

        return searchMultipleGitHubRepos(queries, authInfo, userContext);
      }
    )
  );
}

/**
 * Check if a query has valid topics
 */
function hasValidTopics(query: GitHubReposSearchQuery): boolean {
  return Boolean(
    query.topicsToSearch &&
      (Array.isArray(query.topicsToSearch)
        ? query.topicsToSearch.length > 0
        : query.topicsToSearch)
  );
}

/**
 * Check if a query has valid keywords
 */
function hasValidKeywords(query: GitHubReposSearchQuery): boolean {
  return Boolean(query.keywordsToSearch && query.keywordsToSearch.length > 0);
}

/**
 * Create a search-specific reasoning message
 */
function createSearchReasoning(
  originalReasoning: string | undefined,
  searchType: 'topics' | 'keywords'
): string {
  const suffix =
    searchType === 'topics' ? 'topics-based search' : 'keywords-based search';
  return originalReasoning
    ? `${originalReasoning} (${suffix})`
    : `${searchType.charAt(0).toUpperCase() + searchType.slice(1)}-based repository search`;
}

/**
 * Expands queries that have both topicsToSearch and keywordsToSearch into separate queries
 * This improves search effectiveness by allowing each search type to be optimized independently
 */
function expandQueriesWithBothSearchTypes(
  queries: GitHubReposSearchQuery[]
): GitHubReposSearchQuery[] {
  const expandedQueries: GitHubReposSearchQuery[] = [];

  for (const query of queries) {
    const hasTopics = hasValidTopics(query);
    const hasKeywords = hasValidKeywords(query);

    if (hasTopics && hasKeywords) {
      // Split into two separate queries for better search optimization
      const { topicsToSearch, keywordsToSearch, ...baseQuery } = query;

      expandedQueries.push(
        {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'topics'),
          topicsToSearch,
        },
        {
          ...baseQuery,
          reasoning: createSearchReasoning(query.reasoning, 'keywords'),
          keywordsToSearch,
        }
      );
    } else {
      expandedQueries.push(query);
    }
  }

  return expandedQueries;
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  const expandedQueries = expandQueriesWithBothSearchTypes(queries);

  return executeBulkOperation(
    expandedQueries,
    async (query: GitHubReposSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubReposAPI(
          query,
          authInfo,
          userContext
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const repositories =
          'data' in apiResult
            ? apiResult.data.repositories || []
            : ([] satisfies SimplifiedRepository[]);

        // Generate custom hints based on search type
        const customHints = generateSearchSpecificHints(
          query,
          repositories.length > 0
        );

        return createSuccessResult(
          query,
          { repositories },
          repositories.length > 0,
          'GITHUB_SEARCH_REPOSITORIES',
          customHints
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      keysPriority: ['repositories', 'error'] satisfies Array<
        keyof RepoSearchResult
      >,
    }
  );
}

/**
 * Generate search-specific hints based on query type and results
 */
function generateSearchSpecificHints(
  query: GitHubReposSearchQuery,
  hasResults: boolean
): string[] | undefined {
  const hints: string[] = [];
  const hasTopics = hasValidTopics(query);
  const hasKeywords = hasValidKeywords(query);

  if (hasTopics && hasResults) {
    // Topic search with results - encourage exploration but verify relevance
    hints.push(
      "CRITICAL: Verify each repository's relevance to your researchGoal - topic results are broad categories"
    );
    hints.push(
      'Topic search found curated repositories - excellent for exploration and discovery'
    );
    hints.push(
      'Explore related topics to discover more repositories in similar categories'
    );
  } else if (hasTopics && !hasResults) {
    // Topic search with no results - suggest alternatives
    hints.push(
      'No results for topic search - try related or broader topics for exploration'
    );
    hints.push(
      'Consider switching to keywordsToSearch for broader coverage of name/description/readme'
    );
  } else if (hasKeywords && !hasResults && !hasTopics) {
    // Keywords search with no results - suggest topics
    hints.push(
      'No results with keywords - try topicsToSearch for more precise, curated exploration'
    );
  }

  return hints.length > 0 ? hints : undefined;
}
