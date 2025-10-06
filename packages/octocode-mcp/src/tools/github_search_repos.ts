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
  SimplifiedRepository,
} from '../scheme/github_search_repos';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
  ProcessedBulkResult,
} from '../utils/bulkOperations';
import { generateEmptyQueryHints } from './hints';
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
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateEmptyQueryHints(
            TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES
          );

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        return searchMultipleGitHubRepos(args.queries, authInfo, userContext);
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

  const { results, errors } = await processBulkQueries(
    expandedQueries,
    async (
      query: GitHubReposSearchQuery,
      _index: number
    ): Promise<ProcessedBulkResult> => {
      try {
        const apiResult = await searchGitHubReposAPI(
          query,
          authInfo,
          userContext
        );

        if ('error' in apiResult) {
          return {
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            suggestions: query.suggestions,
            error: apiResult.error,
            metadata: {},
          } as ProcessedBulkResult;
        }

        // Extract repository data
        const repositories = apiResult.data.repositories || [];
        const typedRepositories =
          repositories as unknown as SimplifiedRepository[];

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          suggestions: query.suggestions,
          repositories: typedRepositories,
          metadata: {},
        } as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          suggestions: query.suggestions,
          error: errorMessage,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    keysPriority: [
      'researchGoal',
      'reasoning',
      'suggestions',
      'owner',
      'repo',
      'description',
      'url',
      'stars',
      'updatedAt',
    ],
  };

  return createBulkResponse(config, results, errors, expandedQueries);
}
