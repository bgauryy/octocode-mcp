import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

import { createResult } from '../responses.js';
import { TOOL_NAMES } from '../constants.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import {
  GitHubCodeSearchQuery,
  GitHubCodeSearchBulkQuerySchema,
  GitHubSearchCodeInput,
  type SearchResult,
} from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/index.js';
import {
  createBulkResponse,
  BulkResponseConfig,
  processBulkQueries,
  ProcessedBulkResult,
} from '../utils/bulkOperations.js';
import { generateEmptyQueryHints } from './hints.js';
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
        args: Record<string, unknown>,
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        // Type assertion after validation
        const typedArgs = args as unknown as GitHubSearchCodeInput;
        if (
          !typedArgs.queries ||
          !Array.isArray(typedArgs.queries) ||
          typedArgs.queries.length === 0
        ) {
          const hints = generateEmptyQueryHints(TOOL_NAMES.GITHUB_SEARCH_CODE);

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        return searchMultipleGitHubCode(
          typedArgs.queries,
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
  userContext?: import('../security/withSecurityValidation.js').UserContext
): Promise<CallToolResult> {
  const { results, errors } = await processBulkQueries(
    queries,
    async (
      query: GitHubCodeSearchQuery,
      _index: number
    ): Promise<ProcessedBulkResult> => {
      try {
        const apiResult = await searchGitHubCodeAPI(
          query,
          authInfo,
          userContext?.sessionId
        );

        if ('error' in apiResult) {
          return {
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            error: apiResult.error,
            metadata: {},
          } as ProcessedBulkResult;
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

        const result: SearchResult = {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner,
          repo,
          files: filteredItems.map(
            (item: OptimizedCodeSearchResult['items'][0]) => ({
              path: item.path,
              text_matches: item.matches.map(
                (match: OptimizedCodeSearchResult['items'][0]['matches'][0]) =>
                  match.context
              ),
            })
          ),
          metadata: {},
        };

        return result as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          error: errorMessage,
          metadata: {},
        } as ProcessedBulkResult;
      }
    }
  );

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
    keysPriority: [
      'files',
      'error',
      'hints',
      'query',
      'metadata',
    ] satisfies Array<keyof SearchResult>,
  };

  return createBulkResponse(config, results, errors, queries);
}
