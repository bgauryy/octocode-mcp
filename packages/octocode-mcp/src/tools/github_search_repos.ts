import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type { UserContext } from '../types.js';
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
import type {
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from '../types.js';

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
      TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      async (
        args: {
          queries: GitHubReposSearchQuery[];
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        return searchMultipleGitHubRepos(
          args.queries || [],
          authInfo,
          userContext
        );
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

        return createSuccessResult(
          query,
          { repositories },
          repositories.length > 0,
          'GITHUB_SEARCH_REPOSITORIES'
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
