import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { createResult } from '../responses.js';
import { fetchGitHubFileContentAPI } from '../github/index.js';
import { TOOL_NAMES } from '../constants.js';
import {
  FileContentQuery,
  FileContentBulkQuerySchema,
  type ContentResult,
} from '../scheme/github_fetch_content.js';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
  type ProcessedBulkResult,
} from '../utils/bulkOperations.js';
import { isSamplingEnabled } from '../serverConfig.js';
import { SamplingUtils, performSampling } from '../sampling.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';
import { generateEmptyQueryHints } from './hints.js';

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
        const emptyQueries =
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0;

        if (emptyQueries) {
          const hints = generateEmptyQueryHints(
            TOOL_NAMES.GITHUB_FETCH_CONTENT
          );
          const instructions = Array.isArray(hints)
            ? hints.join('\n')
            : String(hints);

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            instructions,
            isError: true,
          });
        }

        return fetchMultipleGitHubFileContents(
          server,
          args.queries,
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
  const { results, errors } = await processBulkQueries(
    queries,
    async (
      query: FileContentQuery,
      _index: number
    ): Promise<ProcessedBulkResult> => {
      try {
        // Create properly typed request using smart type conversion
        // Handle fullContent parameter - if true, ignore other content selection parameters
        const fullContent =
          typeof query.fullContent === 'boolean' ? query.fullContent : false;

        const apiRequest = {
          owner: String(query.owner),
          repo: String(query.repo),
          path: String(query.path),
          branch: query.branch ? String(query.branch) : undefined,
          fullContent: fullContent,
          // If fullContent is true, don't pass startLine/endLine/matchString
          startLine: fullContent
            ? undefined
            : typeof query.startLine === 'number'
              ? query.startLine
              : undefined,
          endLine: fullContent
            ? undefined
            : typeof query.endLine === 'number'
              ? query.endLine
              : undefined,
          matchString: fullContent
            ? undefined
            : query.matchString
              ? String(query.matchString)
              : undefined,
          matchStringContextLines:
            typeof query.matchStringContextLines === 'number'
              ? query.matchStringContextLines
              : 5,
          minified: typeof query.minified === 'boolean' ? query.minified : true,
          sanitize: typeof query.sanitize === 'boolean' ? query.sanitize : true,
          suggestions: query.researchSuggestions,
        };

        const apiResult = await fetchGitHubFileContentAPI(
          apiRequest,
          authInfo,
          userContext?.sessionId
        );

        // Extract the actual result from the GitHubAPIResponse wrapper
        const result = 'data' in apiResult ? apiResult.data : apiResult;

        // Check if result is an error
        if ('error' in result) {
          return {
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            error: result.error,
          };
        }

        // Build the result object with flattened format
        const baseResultObj = {
          ...result, // Flatten all result properties (filePath, owner, repo, content, etc.)
        };

        const resultObj = { ...baseResultObj };

        // Add sampling result if BETA features are enabled
        if (
          isSamplingEnabled() &&
          result &&
          typeof result === 'object' &&
          'content' in result
        ) {
          try {
            // Create sampling request to explain the code
            const samplingRequest = SamplingUtils.createQASamplingRequest(
              `What does this ${query.path} code file do? Describe its main functionality, key components, and purpose in simple terms.
              which research path can I take to research more about this file?
              what is the best way to use this file?
              Is somthing missing from this file to understand it better?`,
              `File: ${query.owner}/${query.repo}/${query.path}\n\nCode:\n${result.content}`,
              { maxTokens: 2000, temperature: 0.3 }
            );

            // Perform actual MCP sampling to explain the code
            const samplingResponse = await performSampling(
              server,
              samplingRequest
            );

            resultObj.sampling = {
              codeExplanation: samplingResponse.content,
              path: String(query.path),
              repo: `${String(query.owner)}/${String(query.repo)}`,
              usage: samplingResponse.usage,
              stopReason: samplingResponse.stopReason,
            };

            // Store the sampling request for potential debugging/analysis
            (
              resultObj as typeof resultObj & {
                _samplingRequest?: unknown;
              }
            )._samplingRequest = samplingRequest;
          } catch (_error) {
            // Sampling failed, continue without it - silent failure for beta feature
          }
        }

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          ...resultObj,
        } as ProcessedBulkResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          error: errorMessage,
        } as ProcessedBulkResult;
      }
    }
  );

  const config: BulkResponseConfig = {
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
  };

  return createBulkResponse(config, results, errors, queries);
}
