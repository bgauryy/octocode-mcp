import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubCommitsAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubCommitSearchQuery,
  GitHubCommitSearchBulkQuerySchema,
  CommitSearchResult,
} from '../scheme/github_search_commits.js';
import { GitHubCommitSearchParams } from '../github/github-openapi';
import { generateHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';

export function registerSearchGitHubCommitsTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_COMMITS],
      inputSchema: GitHubCommitSearchBulkQuerySchema.shape,
      annotations: {
        title: 'GitHub Commit Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (
        args: {
          queries: GitHubCommitSearchQuery[];
          verbose?: boolean;
        },
        authInfo?: AuthInfo,
        userContext?: import('../security/withSecurityValidation').UserContext
      ): Promise<CallToolResult> => {
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one commit search query with search terms or filters',
            ],
          });

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
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

        // Check if any query has verbose=true
        const hasVerboseQuery = args.queries.some(q => q.verbose === true);

        return searchMultipleGitHubCommits(
          args.queries,
          hasVerboseQuery,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function searchMultipleGitHubCommits(
  queries: GitHubCommitSearchQuery[],
  verbose: boolean = false,
  authInfo?: AuthInfo,
  userContext?: import('../security/withSecurityValidation').UserContext
): Promise<CallToolResult> {
  const results = await Promise.allSettled(
    queries.map(async (query, index) => {
      const queryId = query.id || `commit-search_${index + 1}`;

      try {
        const result = await searchSingleCommit(query, authInfo, userContext);
        return {
          queryId,
          data: result,
          metadata: {
            resultCount: 'error' in result ? 0 : result.commits?.length || 0,
            hasResults:
              'error' in result ? false : (result.commits?.length || 0) > 0,
            searchType: 'error' in result ? 'error' : 'success',
            ...(verbose || 'error' in result ? { queryArgs: query } : {}),
          },
        };
      } catch (error) {
        return {
          queryId,
          data: {
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
            status: 500,
            hints: ['Internal error occurred during search'],
          },
          metadata: {
            resultCount: 0,
            hasResults: false,
            searchType: 'error',
            queryArgs: query,
          },
        };
      }
    })
  );

  // Process results
  const allResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      const originalQuery = queries[index];
      return {
        queryId: originalQuery?.id || `commit-search_${index + 1}`,
        data: {
          error: result.reason?.message || 'Unknown error occurred',
          status: 500,
          hints: ['Promise rejected during search'],
        },
        metadata: {
          resultCount: 0,
          hasResults: false,
          searchType: 'error',
          queryArgs: originalQuery,
        },
      };
    }
  });

  const successfulResults = allResults.filter(
    result => !('error' in result.data) || result.data.error === undefined
  );

  const hints = generateHints({
    toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    hasResults: successfulResults.some(r => r.metadata.hasResults),
    totalItems: successfulResults.reduce(
      (sum, r) => sum + r.metadata.resultCount,
      0
    ),
  });

  return createResult({
    data: allResults,
    meta: {
      totalOperations: queries.length,
      successfulOperations: successfulResults.length,
      failedOperations: allResults.length - successfulResults.length,
    },
    hints,
  });
}

async function searchSingleCommit(
  args: GitHubCommitSearchQuery,
  authInfo?: AuthInfo,
  userContext?: import('../security/withSecurityValidation').UserContext
): Promise<CommitSearchResult> {
  // Validate that at least one search parameter is provided
  const hasSearchTerms =
    (Array.isArray(args.queryTerms) && args.queryTerms.length > 0) ||
    (Array.isArray(args.orTerms) && args.orTerms.length > 0);
  const hasFilters =
    args.author ||
    args['author-name'] ||
    args['author-email'] ||
    args.committer ||
    args['committer-name'] ||
    args['committer-email'] ||
    args.hash ||
    args.parent ||
    args.tree ||
    args.merge !== undefined ||
    args['author-date'] ||
    args['committer-date'];

  if (!hasSearchTerms && !hasFilters) {
    return {
      commits: [],
      total_count: 0,
      error: 'At least one search parameter or filter is required',
      hints: [
        'Provide search terms (queryTerms) or filters (author, hash, dates)',
        'Use queryTerms for commit message search',
        'Use author, hash, or date filters for targeted searches',
      ],
      metadata: {},
    };
  }

  if (args.getChangesContent && (!args.owner || !args.repo)) {
    return {
      commits: [],
      total_count: 0,
      error: 'Both owner and repo are required when getChangesContent is true',
      hints: [
        'Specify both owner and repo parameters when requesting commit changes',
        'Example: { owner: "facebook", repo: "react", getChangesContent: true }',
      ],
      metadata: {},
    };
  }

  try {
    const result = await searchGitHubCommitsAPI(
      args as GitHubCommitSearchParams,
      authInfo,
      userContext
    );

    // Check if result is an error
    if ('error' in result) {
      return {
        commits: [],
        total_count: 0,
        error: result.error,
        hints: result.hints || [],
        metadata: {},
      };
    }

    // Success - return the result
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      commits: [],
      total_count: 0,
      error: `Failed to search commits: ${errorMessage}`,
      hints: ['Check search parameters and try again'],
      metadata: {},
    };
  }
}
