import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses';
import {
  fetchGitHubFileContentAPI,
  getDefaultBranch,
  generateFileAccessHints,
} from '../../utils/githubAPI';
import type { GithubFetchRequestParams } from '../../types';
import {
  generateSmartHints,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import {
  FileContentQuery,
  FileContentQueryResult,
  FileContentQuerySchema,
} from './scheme/github_fetch_content';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

const DESCRIPTION = `
Fetch file contents with smart context extraction using GitHub API.

Supports: Up to 10 files fetching with auto-fallback for branches

KEY WORKFLOW: 
  - Code Research: ${TOOL_NAMES.GITHUB_SEARCH_CODE} results -> fetch file using  "matchString" ->  get context around matches
  - File Content: ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} results  -> fetch relevant files to fetch by structure and file path

IMPORTANT: Always verify file paths before fetching using ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} and ${TOOL_NAMES.GITHUB_SEARCH_CODE}.
Never assume file locations - verify first to avoid failed queries and ensure dynamic research success.
Get enough context to understand the file and its purpose
Try to get similar or related files for better context understanding

OPTIMIZATION: Use startLine/endLine for partial access, matchString for precise extraction with context lines
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
            'Array of up to 10 different file fetch queries for parallel execution'
          ),
      },
      annotations: {
        title: 'GitHub File Content - API Only (Optimized)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: { queries: FileContentQuery[] }): Promise<CallToolResult> => {
      if (!Array.isArray(args.queries) || args.queries.length === 0) {
        return createResult({
          data: {
            results: [],
            summary: {
              totalQueries: 0,
              successfulQueries: 0,
              failed: 0,
            },
          },
          hints: ['No queries provided'],
        });
      }

      return fetchMultipleGitHubFileContents(args.queries, opts);
    }
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[],
  opts: any
): Promise<CallToolResult> {
  const results: FileContentQueryResult[] = [];

  // Execute all queries in parallel
  const queryPromises = queries.map(async (query, index) => {
    const queryId = query.id || `query_${index + 1}`;
    const params: GithubFetchRequestParams = {
      owner: query.owner,
      repo: query.repo,
      filePath: query.filePath,
      branch: query.branch,
      startLine: query.startLine,
      endLine: query.endLine,
      contextLines: query.contextLines,
      matchString: query.matchString,
      minified: query.minified ?? true,
    };

    try {
      // Use only API
      const apiResult = await fetchGitHubFileContentAPI(params, opts.ghToken);

      // Check if API call was successful
      if (apiResult.isError) {
        // Get default branch for better hints
        const defaultBranch = await getDefaultBranch(
          query.owner,
          query.repo,
          opts.ghToken
        );
        const errorText =
          typeof apiResult.content?.[0]?.text === 'string'
            ? apiResult.content[0].text
            : 'API request failed';
        const hints = generateFileAccessHints(
          query.owner,
          query.repo,
          query.filePath,
          query.branch || 'main',
          defaultBranch,
          errorText
        );

        // Add critical verification hints for failed file fetches
        hints.unshift(
          `CRITICAL: Use githubViewRepoStructure to verify ${query.filePath} exists in ${query.owner}/${query.repo}`,
          `CRITICAL: Use githubSearchCode to find files by content instead of assuming paths`
        );

        return {
          queryId,
          originalQuery: query,
          result: {
            error: errorText,
            hints,
          },
          fallbackTriggered: false,
          error: errorText,
        };
      }

      // Extract result data
      const resultData =
        apiResult.content?.[0]?.text &&
        typeof apiResult.content[0].text === 'string'
          ? JSON.parse(apiResult.content[0].text).data
          : null;

      if (!resultData) {
        return {
          queryId,
          originalQuery: query,
          result: { error: 'No data returned from API' },
          fallbackTriggered: false,
          error: 'No data returned from API',
        };
      }

      return {
        queryId,
        originalQuery: query,
        result: resultData,
        fallbackTriggered: false,
      };
    } catch (error) {
      // Handle any unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        queryId,
        originalQuery: query,
        result: { error: `Unexpected error: ${errorMessage}` },
        fallbackTriggered: false,
        error: errorMessage,
      };
    }
  });

  // Wait for all queries to complete
  const queryResults = await Promise.all(queryPromises);
  results.push(...queryResults);

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(
    r => !('error' in r.result) && !r.error
  ).length;

  // Generate comprehensive hints
  const hints = generateSmartHints(TOOL_NAMES.GITHUB_FETCH_CONTENT, {
    hasResults: successfulQueries > 0,
    totalItems: successfulQueries,
    customHints: results
      .filter(r => r.result?.hints)
      .flatMap(r => r.result.hints)
      .slice(0, 5), // Limit to 5 most relevant hints
  });

  // Add research goal hints if we have successful results
  const researchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  if (researchGoal && successfulQueries > 0) {
    const goalHints = getResearchGoalHints(
      TOOL_NAMES.GITHUB_FETCH_CONTENT,
      researchGoal
    );
    hints.push(...goalHints);
  }

  // Add smart research guidance when ALL queries fail
  if (successfulQueries === 0 && totalQueries > 0) {
    const uniqueRepos = Array.from(
      new Set(queries.map(q => `${q.owner}/${q.repo}`))
    );

    if (uniqueRepos.length === 1) {
      const [owner, repo] = uniqueRepos[0].split('/');
      hints.push(
        `CRITICAL: Use githubViewRepoStructure to explore ${owner}/${repo} structure and verify file paths`,
        `CRITICAL: Use githubSearchCode to find files by content in ${owner}/${repo} - do not assume file locations`
      );
    } else {
      hints.push(
        `CRITICAL: Use githubViewRepoStructure to verify file paths in each repository`,
        `CRITICAL: Use githubSearchCode to search for files by content - do not assume file locations`
      );
    }
  }

  return createResult({
    data: {
      results: results,
      summary: {
        totalQueries: totalQueries,
        successfulQueries: successfulQueries,
        failed: totalQueries - successfulQueries,
      },
    },
    hints,
  });
}
