import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { fetchGitHubFileContentAPI } from '../../utils/githubAPI';
import { TOOL_NAMES } from './utils/toolConstants';
import {
  FileContentQuery,
  FileContentBulkQuerySchema,
  FileContentQueryResult,
} from './scheme/github_fetch_content';
import { ensureUniqueQueryIds } from './utils/queryUtils';
import { generateHints } from './utils/hints_consolidated';

const DESCRIPTION = `Fetch file contents from GitHub repositories with intelligent context extraction.

Retrieves complete file contents with smart context handling, partial access capabilities,
and research-oriented guidance. Perfect for examining implementations, documentation, and configuration files.

PRECISION INTEGRATION: Uses same content processing pipeline as code search results,
ensuring consistent precision, security, and optimization.

FEATURES:
- Content Precision: Same processing pipeline as code search text_matches
- Complete file retrieval: Full file contents with proper formatting
- Partial access: Specify line ranges for targeted content extraction
- Context extraction: Smart matching with surrounding context using matchString
- Security & Optimization: Same sanitization and minification as search results
- Research optimization: Tailored hints based on research goals

BEST PRACTICES:
- Use line ranges for large files to focus on relevant sections
- Leverage matchString for finding specific code patterns from search results
- Results processed identically to code search text_matches for consistency
- Combine with repository structure exploration for navigation
- Specify research goals for optimized next-step suggestions`;

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.registerTool(
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
      async (args: {
        queries: FileContentQuery[];
      }): Promise<CallToolResult> => {
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

        return fetchMultipleGitHubFileContents(args.queries);
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[]
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'file-content');
  const results: FileContentQueryResult[] = [];

  // Execute all queries
  for (const query of uniqueQueries) {
    try {
      const apiResult = await fetchGitHubFileContentAPI(query);

      // Extract the actual result from the GitHubAPIResponse wrapper
      const result = 'data' in apiResult ? apiResult.data : apiResult;

      results.push({
        queryId: query.id,
        researchGoal: query.researchGoal,
        result: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      results.push({
        queryId: query.id!,
        researchGoal: query.researchGoal,
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

  // Extract common research goal from queries
  const researchGoals = uniqueQueries
    .map(q => q.researchGoal)
    .filter(goal => !!goal);
  const commonResearchGoal =
    researchGoals.length > 0 ? researchGoals[0] : undefined;

  const hints = generateHints({
    toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
    hasResults: successfulQueries > 0,
    totalItems: successfulQueries,
    researchGoal: commonResearchGoal,
    // Don't try to extract hints from results - they don't exist in error objects
    // This prevents potential loops and undefined behavior
    customHints: [],
  });

  return createResult({
    data: results, // Flat array of results
    hints,
  });
}
