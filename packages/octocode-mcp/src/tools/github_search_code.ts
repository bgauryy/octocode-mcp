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

function extractOwnerAndRepo(nameWithOwner: string | undefined): {
  owner?: string;
  repo?: string;
} {
  if (!nameWithOwner) return {};

  const parts = nameWithOwner.split('/');
  return parts.length === 2 ? { owner: parts[0], repo: parts[1] } : {};
}

function getNameWithOwner(apiResult: {
  data: {
    repository?: { name?: string };
    items: Array<{ repository?: { nameWithOwner?: string } }>;
  };
}): string | undefined {
  return (
    apiResult.data.repository?.name ||
    apiResult.data.items[0]?.repository?.nameWithOwner
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

        const { owner, repo } = extractOwnerAndRepo(
          getNameWithOwner(apiResult)
        );

        const files = apiResult.data.items
          .filter(item => !shouldIgnoreFile(item.path))
          .map(item => {
            if (query.match === 'path') {
              return { path: item.path, text_matches: [] };
            }
            return {
              path: item.path,
              text_matches: item.matches.map(match => match.context),
            };
          });

        return createSuccessResult(
          query,
          {
            files,
            owner,
            repo,
          } satisfies SearchResult,
          files.length > 0,
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
