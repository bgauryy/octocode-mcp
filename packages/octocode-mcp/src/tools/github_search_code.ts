import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubCodeSearchQuery,
  SearchResult,
} from '../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { GitHubCodeSearchBulkQuerySchema } from '../scheme/github_search_code.js';
import { searchGitHubCodeAPI } from '../github/codeSearch.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreFile } from '../utils/fileFilters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerGitHubSearchCodeTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema,
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
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_SEARCH_CODE, queries);
          } catch {
            // ignore
          }
        }

        return searchMultipleGitHubCode(queries, authInfo, sessionId);
      }
    )
  );
}

async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        const apiResult = await searchGitHubCodeAPI(query, authInfo, sessionId);

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        if (!('data' in apiResult)) {
          return handleCatchError(
            new Error('Invalid API response structure'),
            query
          );
        }

        // Group files by repository (nameWithOwner)
        // - For content matches: { "repo": { "path": ["match1", "match2"] } }
        // - For path-only matches: { "repo": ["path1", "path2"] }
        const files: Record<string, Record<string, string[]> | string[]> = {};
        const filteredItems = apiResult.data.items.filter(
          item => !shouldIgnoreFile(item.path)
        );

        const isPathOnlyMatch = query.match === 'path';

        for (const item of filteredItems) {
          const nameWithOwner = item.repository?.nameWithOwner || 'unknown';

          if (isPathOnlyMatch) {
            // For path-only matches, just collect paths as an array
            if (!files[nameWithOwner]) {
              files[nameWithOwner] = [];
            }
            (files[nameWithOwner] as string[]).push(item.path);
          } else {
            // For content matches, group by path -> text_matches
            if (!files[nameWithOwner]) {
              files[nameWithOwner] = {};
            }
            const textMatches = item.matches.map(match => match.context);
            (files[nameWithOwner] as Record<string, string[]>)[item.path] =
              textMatches;
          }
        }

        return createSuccessResult(
          query,
          { files } satisfies SearchResult,
          Object.keys(files).length > 0,
          'GITHUB_SEARCH_CODE'
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'error'] satisfies Array<keyof SearchResult>,
    }
  );
}
