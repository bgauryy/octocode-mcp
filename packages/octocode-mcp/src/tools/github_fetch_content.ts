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
  FileContentQueryResult,
} from '../scheme/github_fetch_content';
import { ensureUniqueQueryIds } from '../utils/bulkOperations.js';
import { generateHints } from './hints.js';
import { isSamplingEnabled } from '../serverConfig.js';
import { SamplingUtils, performSampling } from '../sampling.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

const DESCRIPTION = `Fetch file content from GitHub repositories

GOAL:
To get more research CONTEXT data from real implementations, documentation, and configuration files.

FEATURES:
- Complete file retrieval
- Partial file retrieval
  - startLine / endLine
  - matchString / matchStringContextLines

USAGE:
- Use line ranges for large files
- Use matchString to find specific patterns from search results
- Specify research goals for optimized suggestions
- Combine with repository structure exploration

HINTS:
- Validate documentation from implementation usign search and fetch tools
- Use fetched content to find more research data to search (using search tools)
- If needed fetch more files or content from retrived content
- Use structure tool to understand the repository structure better for better context fetching`;

export function registerFetchGitHubFileContentTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      description: DESCRIPTION,
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
          return createResult({
            isError: true,
            data: { error: 'Queries array is required and cannot be empty' },
            hints: ['Provide at least one file content query'],
          });
        }

        if (args.queries.length > 10) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
            hasResults: false,
            errorMessage: 'Too many queries provided',
            customHints: [
              'Limit to 10 file queries per request for optimal performance',
            ],
          });

          return createResult({
            isError: true,
            data: { error: 'Maximum 10 file queries allowed per request' },
            hints,
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
  const uniqueQueries = ensureUniqueQueryIds(queries, 'file-content');
  const results: FileContentQueryResult[] = [];

  // Execute all queries
  for (const query of uniqueQueries) {
    try {
      // Create properly typed request using smart type conversion
      const apiRequest = {
        owner: String(query.owner),
        repo: String(query.repo),
        filePath: String(query.filePath),
        branch: query.branch ? String(query.branch) : undefined,
        startLine:
          typeof query.startLine === 'number' ? query.startLine : undefined,
        endLine: typeof query.endLine === 'number' ? query.endLine : undefined,
        matchString: query.matchString ? String(query.matchString) : undefined,
        matchStringContextLines:
          typeof query.matchStringContextLines === 'number'
            ? query.matchStringContextLines
            : undefined,
        minified: typeof query.minified === 'boolean' ? query.minified : true,
      };

      const apiResult = await fetchGitHubFileContentAPI(
        apiRequest,
        authInfo,
        userContext?.sessionId
      );

      // Extract the actual result from the GitHubAPIResponse wrapper
      const result = 'data' in apiResult ? apiResult.data : apiResult;

      // Build the result object with new format (add queryDescription and queryId)
      const queryDescription = `${query.owner}/${query.repo} - ${query.filePath}`;
      const resultObj: FileContentQueryResult = {
        queryId: query.id, // Add sequential query ID
        queryDescription,
        result: result,
      };

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
            `What does this ${query.filePath} code file do? Describe its main functionality, key components, and purpose in simple terms.
            which research path can I take to research more about this file?
            what is the best way to use this file?
            Is somthing missing from this file to understand it better?`,
            `File: ${query.owner}/${query.repo}/${query.filePath}\n\nCode:\n${result.content}`,
            { maxTokens: 2000, temperature: 0.3 }
          );

          // Perform actual MCP sampling to explain the code
          const samplingResponse = await performSampling(
            server,
            samplingRequest
          );

          resultObj.sampling = {
            codeExplanation: samplingResponse.content,
            filePath: String(query.filePath),
            repo: `${String(query.owner)}/${String(query.repo)}`,
            usage: samplingResponse.usage,
            stopReason: samplingResponse.stopReason,
          };

          // Store the sampling request for potential debugging/analysis
          (
            resultObj as FileContentQueryResult & {
              _samplingRequest?: unknown;
            }
          )._samplingRequest = samplingRequest;
        } catch (_error) {
          // Sampling failed, continue without it - silent failure for beta feature
        }
      }

      results.push(resultObj);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      const queryDescription = `${query.owner}/${query.repo} - ${query.filePath}`;
      results.push({
        queryId: query.id, // Add sequential query ID
        queryDescription,
        originalQuery: query, // Only include on error
        result: { error: errorMessage },
        error: errorMessage,
      });
    }
  }

  // Generate intelligent hints based on results
  const successfulQueries = results.filter(
    r => !('error' in r.result) && !r.error
  ).length;

  const hints = generateHints({
    toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
    hasResults: successfulQueries > 0,
    totalItems: successfulQueries,
    // Don't try to extract hints from results - they don't exist in error objects
    // This prevents potential loops and undefined behavior
    customHints: [],
  });

  // Use consistent bulk response format: {results: [], hints: []}
  const responseData = {
    results: results, // Use 'results' field for consistency with other bulk tools
    hints,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(responseData, null, 2),
      },
    ],
    isError: false,
  };
}
