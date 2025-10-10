import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation.js';
import { TOOL_NAMES } from '../constants.js';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
  type SearchResult,
} from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/codeSearch.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import type { OptimizedCodeSearchResult } from '../github/githubAPI.js';
import { DESCRIPTIONS } from './descriptions.js';
import { shouldIgnoreFile } from '../utils/fileFilters.js';

export function registerGitHubSearchCodeTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
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
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      async (
        args: {
          queries: GitHubCodeSearchQuery[];
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        // executeBulkOperation handles empty arrays gracefully
        return searchMultipleGitHubCode(
          args.queries || [],
          authInfo,
          userContext
        );
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubCodeAPI(
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

        // Extract repository context from nameWithOwner
        let owner: string | undefined;
        let repo: string | undefined;

        const nameWithOwner =
          apiResult.data.repository?.name ||
          (apiResult.data.items.length > 0 &&
          apiResult.data.items[0]?.repository?.nameWithOwner
            ? apiResult.data.items[0].repository.nameWithOwner
            : undefined);

        if (nameWithOwner) {
          const parts = nameWithOwner.split('/');
          if (parts.length === 2) {
            owner = parts[0];
            repo = parts[1];
          }
        }

        // Filter out ignored files from results - additional filtering at tool level
        const filteredItems = apiResult.data.items.filter(
          (item: OptimizedCodeSearchResult['items'][0]) =>
            !shouldIgnoreFile(item.path)
        );

        const files = filteredItems.map(
          (item: OptimizedCodeSearchResult['items'][0]) => ({
            path: item.path,
            text_matches: item.matches.map(
              (match: OptimizedCodeSearchResult['items'][0]['matches'][0]) =>
                match.context
            ),
          })
        );

        return {
          status: files.length === 0 ? 'empty' : 'hasResults',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner,
          repo,
          files,
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
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'error'] satisfies Array<keyof SearchResult>,
    }
  );
}
