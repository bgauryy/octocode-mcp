import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubReposSearchQuery,
  SimplifiedRepository,
  RepoSearchResult,
} from '../types.js';
import { searchGitHubReposAPI } from '../github/repoSearch.js';
import { TOOL_NAMES, DESCRIPTIONS, getDynamicHints } from './toolMetadata.js';
import { GitHubReposSearchQuerySchema } from '../scheme/github_search_repos.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
  invokeCallbackSafely,
} from './utils.js';

export function registerSearchGitHubReposTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES],
      inputSchema: GitHubReposSearchQuerySchema,
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
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          queries
        );

        return searchMultipleGitHubRepos(queries, authInfo, sessionId);
      }
    )
  );
}

function hasValidTopics(query: GitHubReposSearchQuery): boolean {
  return Boolean(
    query.topicsToSearch &&
    (Array.isArray(query.topicsToSearch)
      ? query.topicsToSearch.length > 0
      : query.topicsToSearch)
  );
}

function hasValidKeywords(query: GitHubReposSearchQuery): boolean {
  return Boolean(query.keywordsToSearch && query.keywordsToSearch.length > 0);
}

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

function expandQueriesWithBothSearchTypes(
  queries: GitHubReposSearchQuery[]
): GitHubReposSearchQuery[] {
  const expandedQueries: GitHubReposSearchQuery[] = [];

  for (const query of queries) {
    const hasTopics = hasValidTopics(query);
    const hasKeywords = hasValidKeywords(query);

    if (hasTopics && hasKeywords) {
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
  sessionId?: string
): Promise<CallToolResult> {
  const expandedQueries = expandQueriesWithBothSearchTypes(queries);

  return executeBulkOperation(
    expandedQueries,
    async (query: GitHubReposSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubReposAPI(
          query,
          authInfo,
          sessionId
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const repositories =
          'data' in apiResult
            ? apiResult.data.repositories || []
            : ([] satisfies SimplifiedRepository[]);

        const customHints = generateSearchSpecificHints(
          query,
          repositories.length > 0
        );

        return createSuccessResult(
          query,
          { repositories },
          repositories.length > 0,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
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

function generateSearchSpecificHints(
  query: GitHubReposSearchQuery,
  hasResults: boolean
): string[] | undefined {
  const hints: string[] = [];
  const hasTopics = hasValidTopics(query);
  const hasKeywords = hasValidKeywords(query);

  if (hasTopics && hasResults) {
    hints.push(
      ...getDynamicHints(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        'topicsHasResults'
      )
    );
  } else if (hasTopics && !hasResults) {
    hints.push(
      ...getDynamicHints(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, 'topicsEmpty')
    );
  } else if (hasKeywords && !hasResults && !hasTopics) {
    hints.push(
      ...getDynamicHints(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, 'keywordsEmpty')
    );
  }

  return hints.length > 0 ? hints : undefined;
}
