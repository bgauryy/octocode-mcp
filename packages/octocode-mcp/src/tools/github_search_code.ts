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

        const files = apiResult.data.items
          .filter(item => !shouldIgnoreFile(item.path))
          .map(item => {
            // Include repo info for each file so agents can use githubGetFileContent
            const repoName = item.repository?.nameWithOwner;

            // Base file object with optional research context fields
            const baseFile = {
              path: item.path,
              ...(repoName && { repo: repoName }),
              // New fields for cross-tool research context
              ...(item.lineNumbers &&
                item.lineNumbers.length > 0 && {
                  lineNumbers: item.lineNumbers,
                }),
              ...(item.lastModifiedAt && {
                lastModifiedAt: item.lastModifiedAt,
              }),
              ...(typeof item.relevanceRanking === 'number' && {
                relevanceRanking: item.relevanceRanking,
              }),
            };

            if (query.match === 'path') {
              // For path searches, don't include text_matches
              return baseFile;
            }
            return {
              ...baseFile,
              text_matches: item.matches.map(match => match.context),
            };
          });

        // Build result with repository context when all files from same repo
        const result: SearchResult = { files };

        // Add repositoryContext when available (all files from same repo)
        const repoContext = apiResult.data._researchContext?.repositoryContext;
        if (repoContext) {
          result.repositoryContext = repoContext;
        }

        // Generate custom hints based on result
        const customHints = generateCodeSearchHints(files, repoContext);

        return createSuccessResult(
          query,
          result,
          files.length > 0,
          'GITHUB_SEARCH_CODE',
          customHints
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'repositoryContext', 'error'] satisfies Array<
        keyof SearchResult
      >,
    }
  );
}

/**
 * Generate custom hints for code search results to help agents use the data
 */
function generateCodeSearchHints(
  files: Array<{ path: string; repo?: string; text_matches?: string[] }>,
  repoContext?: { owner: string; repo: string }
): string[] {
  const hints: string[] = [];

  if (files.length > 0) {
    // Has results - guide agent on how to use repo info
    if (repoContext) {
      hints.push(
        `All files from ${repoContext.owner}/${repoContext.repo} - ` +
          `use repositoryContext for githubGetFileContent`
      );
    } else if (files.some(f => f.repo)) {
      hints.push(
        `Each file includes 'repo' field (owner/repo) - ` +
          `use it directly with githubGetFileContent`
      );
    }
  }

  return hints;
}
