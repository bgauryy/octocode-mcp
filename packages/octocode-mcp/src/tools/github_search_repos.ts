import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { searchGitHubReposAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubReposSearchQuery,
  GitHubReposSearchQuerySchema,
  SimplifiedRepository,
  type RepoSearchResult,
} from '../scheme/github_search_repos';
import { executeBulkOperation } from '../utils/bulkOperations';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';

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
        // executeBulkOperation handles empty arrays gracefully
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
 * Expands queries that have both topicsToSearch and keywordsToSearch into separate queries
 * This improves search effectiveness by allowing each search type to be optimized independently
 */
function expandQueriesWithBothSearchTypes(
  queries: GitHubReposSearchQuery[]
): GitHubReposSearchQuery[] {
  const expandedQueries: GitHubReposSearchQuery[] = [];

  queries.forEach(query => {
    const hasTopics =
      query.topicsToSearch &&
      (Array.isArray(query.topicsToSearch)
        ? query.topicsToSearch.length > 0
        : query.topicsToSearch);
    const hasKeywords =
      query.keywordsToSearch && query.keywordsToSearch.length > 0;

    if (hasTopics && hasKeywords) {
      // Split into two queries: one for topics, one for keywords
      const baseQuery = { ...query };
      delete baseQuery.topicsToSearch;
      delete baseQuery.keywordsToSearch;

      // Topics-based query
      const topicsQuery: GitHubReposSearchQuery = {
        ...baseQuery,
        reasoning: query.reasoning
          ? `${query.reasoning} (topics-based search)`
          : 'Topics-based repository search',
        topicsToSearch: query.topicsToSearch,
      };

      // Keywords-based query
      const keywordsQuery: GitHubReposSearchQuery = {
        ...baseQuery,
        reasoning: query.reasoning
          ? `${query.reasoning} (keywords-based search)`
          : 'Keywords-based repository search',
        keywordsToSearch: query.keywordsToSearch,
      };

      expandedQueries.push(topicsQuery, keywordsQuery);
    } else {
      // Keep original query if it doesn't have both search types
      expandedQueries.push(query);
    }
  });

  return expandedQueries;
}

async function searchMultipleGitHubRepos(
  queries: GitHubReposSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  // Split queries that have both topicsToSearch and keywordsToSearch
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

        if ('error' in apiResult) {
          return {
            status: 'error',
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            error: apiResult.error,
          };
        }

        // Extract repository data
        const repositories = (apiResult.data.repositories ||
          []) satisfies SimplifiedRepository[];

        return {
          status: repositories.length === 0 ? 'empty' : 'hasResults',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          repositories,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          status: 'error',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          error: errorMessage,
        };
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
