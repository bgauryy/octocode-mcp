import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type { UserContext } from '../types.js';
import { fetchGitHubFileContentAPI } from '../github/fileOperations.js';
import { TOOL_NAMES } from '../constants.js';
import { FileContentBulkQuerySchema } from '../scheme/github_fetch_content.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { isSamplingEnabled } from '../serverConfig.js';
import { SamplingUtils, performSampling } from '../sampling.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { DESCRIPTIONS } from './descriptions.js';
import {
  handleCatchError,
  createSuccessResult,
  handleApiError,
} from './utils.js';
import type { FileContentQuery, ContentResult } from '../types.js';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_FETCH_CONTENT],
      inputSchema: FileContentBulkQuerySchema.shape,
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
        userContext
      ): Promise<CallToolResult> => {
        return fetchMultipleGitHubFileContents(
          server,
          args.queries || [],
          authInfo,
          userContext
        );
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  server: McpServer,
  queries: FileContentQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: FileContentQuery, _index: number) => {
      try {
        const apiRequest = buildApiRequest(query);
        const apiResult = await fetchGitHubFileContentAPI(
          apiRequest,
          authInfo,
          userContext
        );

        // Check if API returned an error (using handleApiError for consistency)
        const apiError = handleApiError(apiResult, query);
        if (apiError) return apiError;

        const result = 'data' in apiResult ? apiResult.data : apiResult;

        const resultWithSampling = await addSamplingIfEnabled(
          server,
          query,
          result as Record<string, unknown>
        );

        const hasContent = hasValidContent(result);

        return createSuccessResult(
          query,
          resultWithSampling,
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
        'path',
        'owner',
        'repo',
        'branch',
        'contentLength',
        'content',
        'isPartial',
        'startLine',
        'endLine',
        'minified',
        'minificationFailed',
        'minificationType',
        'securityWarnings',
        'sampling',
        'error',
      ] satisfies Array<keyof ContentResult>,
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
    // Only include partial content parameters when not fetching full content
    startLine: fullContent ? undefined : query.startLine,
    endLine: fullContent ? undefined : query.endLine,
    matchString:
      fullContent || !query.matchString ? undefined : String(query.matchString),
    matchStringContextLines: query.matchStringContextLines ?? 5,
    minified: query.minified ?? true,
    sanitize: query.sanitize ?? true,
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
 * Create sampling prompt for code file analysis
 */
function createCodeAnalysisPrompt(query: FileContentQuery): string {
  return `What does this ${query.path} code file do? Describe its main functionality, key components, and purpose in simple terms.
which research path can I take to research more about this file?
what is the best way to use this file?
Is something missing from this file to understand it better?`;
}

/**
 * Create context for sampling request
 */
function createSamplingContext(
  query: FileContentQuery,
  content: string
): string {
  return `File: ${query.owner}/${query.repo}/${query.path}\n\nCode:\n${content}`;
}

/**
 * Add AI sampling explanation to result if sampling is enabled
 */
async function addSamplingIfEnabled(
  server: McpServer,
  query: FileContentQuery,
  result: unknown
) {
  if (!isSamplingEnabled() || !hasValidContent(result)) {
    return result as Record<string, unknown>;
  }

  const resultObj = result as Record<string, unknown>;

  try {
    const samplingRequest = SamplingUtils.createQASamplingRequest(
      createCodeAnalysisPrompt(query),
      createSamplingContext(query, String(resultObj.content)),
      { maxTokens: 2000, temperature: 0.3 }
    );

    const samplingResponse = await performSampling(server, samplingRequest);

    return {
      ...resultObj,
      sampling: {
        codeExplanation: samplingResponse.content,
        path: String(query.path),
        repo: `${String(query.owner)}/${String(query.repo)}`,
        usage: samplingResponse.usage,
        stopReason: samplingResponse.stopReason,
      },
      _samplingRequest: samplingRequest,
    };
  } catch (_error) {
    // Silently ignore sampling errors to avoid breaking the main flow
    return resultObj;
  }
}
