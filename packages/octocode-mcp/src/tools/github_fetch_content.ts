import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type { ToolInvocationCallback, FileContentQuery } from '../types.js';
import { fetchGitHubFileContentAPI } from '../github/fileOperations.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { FileContentBulkQuerySchema } from '../scheme/github_fetch_content.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  handleCatchError,
  createSuccessResult,
  handleApiError,
} from './utils.js';

export function registerFetchGitHubFileContentTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_FETCH_CONTENT],
      inputSchema: FileContentBulkQuerySchema,
      annotations: {
        title: 'GitHub File Content Fetch',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_FETCH_CONTENT,
      async (
        args: {
          queries: FileContentQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_FETCH_CONTENT, queries);
          } catch {
            // ignore
          }
        }

        return fetchMultipleGitHubFileContents(queries, authInfo, sessionId);
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[],
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: FileContentQuery, _index: number) => {
      try {
        const apiRequest = buildApiRequest(query);
        const apiResult = await fetchGitHubFileContentAPI(
          apiRequest,
          authInfo,
          sessionId
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const result = 'data' in apiResult ? apiResult.data : apiResult;

        const hasContent = hasValidContent(result);

        // Strip query parameters from result - response should only contain NEW data
        const cleanedResult = stripQueryParams(
          result as Record<string, unknown>
        );

        return createSuccessResult(
          query,
          cleanedResult,
          hasContent,
          'GITHUB_FETCH_CONTENT'
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      keysPriority: [
        'contentLength',
        'content',
        'isPartial',
        'startLine',
        'endLine',
        'lastModified',
        'lastModifiedBy',
        'securityWarnings',
        'error',
      ],
    }
  );
}

/**
 * Build API request from query with proper type conversions and defaults
 */
function buildApiRequest(query: FileContentQuery) {
  const fullContent = Boolean(query.fullContent);

  return {
    owner: String(query.owner),
    repo: String(query.repo),
    path: String(query.path),
    branch: query.branch ? String(query.branch) : undefined,
    fullContent,
    startLine: fullContent ? undefined : query.startLine,
    endLine: fullContent ? undefined : query.endLine,
    matchString:
      fullContent || !query.matchString ? undefined : String(query.matchString),
    matchStringContextLines: query.matchStringContextLines ?? 5,
    minified: query.minified ?? true,
    addTimestamp: query.addTimestamp ?? false,
  };
}

/**
 * Check if result has valid content for sampling
 */
function hasValidContent(result: unknown): boolean {
  return Boolean(
    result &&
    typeof result === 'object' &&
    'content' in result &&
    result.content &&
    String(result.content).length > 0
  );
}

/**
 * Strip query parameters from result - response should only contain NEW data
 * Query already has: owner, repo, path, branch, etc.
 */
function stripQueryParams(
  result: Record<string, unknown>
): Record<string, unknown> {
  const queryParams = new Set(['owner', 'repo', 'path', 'branch']);
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    if (!queryParams.has(key)) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}
