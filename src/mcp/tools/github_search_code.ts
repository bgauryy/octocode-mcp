import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import {
  generateSmartHints,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { searchGitHubCodeAPI } from '../../utils/githubAPI';
import {
  GitHubCodeSearchQuerySchema,
  GitHubCodeSearchQuery,
  ProcessedCodeSearchResult,
} from './scheme/github_search_code';
import { OptimizedCodeSearchResult } from '../../types';

// Extended type for API response with research context
interface CodeSearchAPIResponse extends OptimizedCodeSearchResult {
  _researchContext?: {
    foundPackages: string[];
    foundFiles: string[];
    repositoryContext?: {
      owner: string;
      repo: string;
    };
  };
}

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with strategic query planning.

SEARCH STRATEGY:
SEMANTIC: Natural language terms describing functionality, concepts, business logic
TECHNICAL: Actual code terms, function names, class names, file patterns

Use bulk queries from different angles. Start narrow, broaden if needed.
Workflow: Search → Use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} with matchString for context.

Progressive queries: Core terms → Specific patterns → Documentation → Configuration → Alternatives`;

export function registerGitHubSearchCodeTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubCodeSearchQuerySchema)
          .min(1)
          .max(5)
          .describe(
            '1-5 progressive refinement queries, starting broad then narrowing. PROGRESSIVE STRATEGY: Query 1 should be broad (queryTerms + owner/repo only), then progressively add filters based on initial findings. Use meaningful id descriptions to track refinement phases.'
          ),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include detailed metadata for debugging. Default: false for cleaner responses'
          ),
      },
      annotations: {
        title: 'GitHub Code Search - Progressive Refinement',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubCodeSearchQuery[];
        verbose?: boolean;
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubCode(
            args.queries,
            args.verbose ?? false,
            opts
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          return createResult({
            isError: true,
            hints: [
              `Failed to search code: ${errorMessage}. Try broader search terms or check repository access.`,
            ],
          });
        }
      }
    )
  );
}

/**
 * Execute multiple GitHub code search queries using API
 */
async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  verbose: boolean = false,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  const processedResults: ProcessedCodeSearchResult[] = [];
  const errors: Array<{ queryId: string; error: string }> = [];
  const aggregatedContext = {
    foundPackages: new Set<string>(),
    foundFiles: new Set<string>(),
    repositoryContexts: new Set<string>(),
  };

  // Execute each query
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    // Validate query
    if (!query.queryTerms || query.queryTerms.length === 0) {
      errors.push({
        queryId,
        error: `Query ${queryId}: queryTerms parameter is required and must contain at least one search term.`,
      });
      continue;
    }

    try {
      // Execute API search
      const result = await searchGitHubCodeAPI(query, opts.ghToken);

      if (result.isError) {
        const errorHints = result.hints as string[] | undefined;
        errors.push({
          queryId,
          error: (errorHints && errorHints[0]) || 'Unknown error occurred',
        });
        continue;
      }

      // Process successful results
      if (result.data) {
        const searchData = result.data as CodeSearchAPIResponse;

        // Extract research context
        if (searchData._researchContext) {
          searchData._researchContext.foundPackages?.forEach((pkg: string) =>
            aggregatedContext.foundPackages.add(pkg)
          );
          searchData._researchContext.foundFiles?.forEach((file: string) =>
            aggregatedContext.foundFiles.add(file)
          );
          if (searchData._researchContext.repositoryContext) {
            const { owner, repo } =
              searchData._researchContext.repositoryContext;
            aggregatedContext.repositoryContexts.add(`${owner}/${repo}`);
          }
        }

        // Convert to flattened format
        if (searchData.items) {
          searchData.items.forEach(item => {
            const matches = item.matches.map(match => match.context);
            processedResults.push({
              queryId,
              repository: item.repository.nameWithOwner,
              path: item.path,
              matches: matches,
              repositoryInfo: {
                nameWithOwner: item.repository.nameWithOwner,
              },
            });
          });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push({
        queryId,
        error: errorMessage,
      });
    }
  }

  // Generate hints
  const totalItems = processedResults.length;
  const hasResults = totalItems > 0;
  const errorMessage = errors.length > 0 ? errors[0].error : undefined;

  const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_CODE, {
    hasResults,
    totalItems,
    errorMessage,
    customHints: [
      ...Array.from(aggregatedContext.foundPackages).map(
        pkg => `Found package: ${pkg}`
      ),
      ...Array.from(aggregatedContext.foundFiles).map(
        file => `Found file: ${file}`
      ),
    ],
  });

  // Add research goal hints if applicable
  const researchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  if (researchGoal && processedResults.length > 0) {
    const goalHints = getResearchGoalHints(
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      researchGoal
    );
    hints.push(...goalHints);
  }

  // Create response
  interface SearchResponse {
    data: ProcessedCodeSearchResult[];
    hints: string[];
    metadata?: {
      totalQueries: number;
      successfulQueries: number;
      failedQueries: number;
      errors: Array<{ queryId: string; error: string }>;
      aggregatedContext: {
        foundPackages: string[];
        foundFiles: string[];
        repositoryContexts: string[];
      };
    };
  }

  const response: SearchResponse = {
    data: processedResults,
    hints,
  };

  // Add metadata in verbose mode
  if (verbose) {
    response.metadata = {
      totalQueries: queries.length,
      successfulQueries: queries.length - errors.length,
      failedQueries: errors.length,
      errors: errors,
      aggregatedContext: {
        foundPackages: Array.from(aggregatedContext.foundPackages),
        foundFiles: Array.from(aggregatedContext.foundFiles),
        repositoryContexts: Array.from(aggregatedContext.repositoryContexts),
      },
    };
  }

  return createResult(response);
}
