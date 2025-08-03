import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { fetchGitHubFileContentAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  FileContentQuery,
  FileContentQuerySchema,
  FileContentQueryResult,
} from './scheme/github_fetch_content';
import { ensureUniqueQueryIds } from './utils/queryUtils';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Fetch file contents from GitHub repositories with intelligent context extraction.

This tool retrieves complete file contents with smart context handling, partial
access capabilities, and research-oriented guidance. Perfect for examining
implementations, documentation, and configuration files.

Key Features:
- Complete file retrieval: Get full file contents with proper formatting
- Partial access: Specify line ranges for targeted content extraction
- Context extraction: Smart matching with surrounding context
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Use line ranges for large files to focus on relevant sections
- Leverage matchString for finding specific code patterns
- Combine with repository structure exploration for navigation
- Specify research goals for optimized next-step suggestions
`;

export function registerFetchGitHubFileContentTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(FileContentQuerySchema)
          .min(1)
          .max(10)
          .describe(
            'Array of up to 10 file content queries for parallel execution'
          ),
      },
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
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_FETCH_CONTENT, {
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one file content query with owner, repo, and filePath',
            ],
          });

          return createResult({
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 10) {
          const hints = generateToolHints(TOOL_NAMES.GITHUB_FETCH_CONTENT, {
            hasResults: false,
            errorMessage: 'Too many queries provided',
            customHints: [
              'Limit to 10 file queries per request for optimal performance',
            ],
          });

          return createResult({
            isError: true,
            error: 'Maximum 10 file queries allowed per request',
            hints,
          });
        }

        return fetchMultipleGitHubFileContents(args.queries, opts);
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[],
  opts: ToolOptions
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'file-content');
  const results: FileContentQueryResult[] = [];

  // Execute all queries
  for (const query of uniqueQueries) {
    try {
      const apiResult = await fetchGitHubFileContentAPI(query, opts.ghToken);

      results.push({
        queryId: query.id,
        originalQuery: query,
        result: apiResult,
        apiResult,
        fallbackTriggered: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      results.push({
        queryId: query.id!,
        originalQuery: query,
        result: { error: errorMessage },
        fallbackTriggered: false,
        error: errorMessage,
      });
    }
  }

  // Aggregate results for context
  const totalQueries = results.length;
  const successfulQueries = results.filter(
    r => !('error' in r.result) && !r.error
  ).length;

  // Build response context for intelligent hints
  const responseContext = {
    foundRepositories: Array.from(
      new Set(
        results
          .filter(r => !('error' in r.result))
          .map(r => `${r.originalQuery.owner}/${r.originalQuery.repo}`)
      )
    ),
    foundFiles: results
      .filter(r => !('error' in r.result))
      .map(r => r.originalQuery.filePath),
    dataQuality: {
      hasContent: successfulQueries > 0,
      hasMatches: results.some(
        r =>
          !('error' in r.result) &&
          'content' in r.result &&
          r.result.content &&
          r.result.content.length > 0
      ),
    },
  };

  // Generate intelligent hints
  const researchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  const hints = generateToolHints(TOOL_NAMES.GITHUB_FETCH_CONTENT, {
    hasResults: successfulQueries > 0,
    totalItems: successfulQueries,
    researchGoal,
    responseContext,
    customHints: results
      .filter(r => 'error' in r.result && r.result.hints)
      .flatMap(r =>
        'error' in r.result && r.result.hints ? r.result.hints : []
      )
      .slice(0, 5), // Limit to 5 most relevant hints
  });

  return createResult({
    data: {
      results,
      meta: {
        researchGoal: researchGoal || 'analysis',
        totalOperations: totalQueries,
        successfulOperations: successfulQueries,
        failedOperations: totalQueries - successfulQueries,
        ...(totalQueries - successfulQueries > 0 && {
          errors: results
            .filter(r => r.error || 'error' in r.result)
            .map(r => ({
              operationId: r.queryId,
              error:
                r.error ||
                ('error' in r.result ? r.result.error : 'Unknown error'),
            })),
        }),
      },
    },
    hints,
  });
}
