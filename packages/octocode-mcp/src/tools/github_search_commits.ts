import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { searchGitHubCommitsAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubCommitSearchQuery,
  GitHubCommitSearchQuerySchema,
} from '../scheme/github_search_commits';
import { GitHubCommitSearchParams } from '../github/github-openapi';
import { generateHints } from './hints';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';

export function registerSearchGitHubCommitsTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_COMMITS],
      inputSchema: GitHubCommitSearchQuerySchema.shape,
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
        args: GitHubCommitSearchQuery,
        authInfo?: AuthInfo,
        userContext?: import('../security/withSecurityValidation').UserContext
      ): Promise<CallToolResult> => {
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
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Search parameters required',
            customHints: [
              'Provide search terms (queryTerms) or filters (author, hash, dates)',
              'Example: queryTerms: ["fix", "bug"] or author: "username"',
            ],
          });

          return createResult({
            data: {
              error: 'At least one search parameter or filter is required',
            },
            isError: true,
            hints,
          });
        }

        if (args.getChangesContent && (!args.owner || !args.repo)) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
            hasResults: false,
            errorMessage: 'Repository required for changes content',
            customHints: [
              'Specify both owner and repo when requesting commit changes',
            ],
          });

          return createResult({
            data: {
              error:
                'Both owner and repo are required when getChangesContent is true',
            },
            isError: true,
            hints,
          });
        }

        try {
          const result = await searchGitHubCommitsAPI(
            args as GitHubCommitSearchParams,
            authInfo,
            userContext
          );

          // Check if result is an error
          if ('error' in result) {
            const hints = generateHints({
              toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
              hasResults: false,
              totalItems: 0,
              errorMessage: result.error,
              customHints: result.hints || [],
            });
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - generate intelligent hints

          const searchTerms = [
            ...(Array.isArray(args.queryTerms) ? args.queryTerms : []),
            ...(Array.isArray(args.orTerms) ? args.orTerms : []),
          ];

          const baseHints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
            hasResults: result.commits.length > 0,
            totalItems: result.commits.length,
            queryContext: {
              owner: args.owner
                ? Array.isArray(args.owner)
                  ? args.owner.map(String)
                  : String(args.owner)
                : undefined,
              repo: args.repo
                ? Array.isArray(args.repo)
                  ? args.repo.map(String)
                  : String(args.repo)
                : undefined,
              queryTerms: searchTerms,
            },
          });

          // Build enhanced hints
          let enhancedHints = baseHints;

          // Add hint about getChangesContent if we have results
          if (result.commits.length > 0) {
            const changesHint =
              args.owner && args.repo
                ? `You can see code changes of the commit using getChangesContent: true`
                : `You can see code changes of the commit using getChangesContent: true (requires owner and repo parameters)`;
            enhancedHints = [changesHint, ...enhancedHints];
          }

          // Add hint about limited results if total_count > shown commits
          if ((result.total_count || 0) > (result.commits?.length || 0)) {
            const limitHint = `Showing ${result.commits?.length || 0} of ${result.total_count} total commits. Increase limit parameter to see more results.`;
            enhancedHints = [limitHint, ...enhancedHints];
          }

          const hints = enhancedHints;

          return createResult({
            data: {
              total_count: result.total_count || 0,
              incomplete_results: result.incomplete_results || false,
              commits: result.commits || [],
            },
            meta: {
              totalResults: result.commits?.length || 0,
              totalAvailable: result.total_count || 0,
              showingLimited:
                (result.total_count || 0) > (result.commits?.length || 0),
            },
            hints,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
            hasResults: false,
            totalItems: 0,
            errorMessage,
          });

          return createResult({
            data: { error: `Failed to search commits: ${errorMessage}` },
            isError: true,
            hints,
          });
        }
      }
    )
  );
}
