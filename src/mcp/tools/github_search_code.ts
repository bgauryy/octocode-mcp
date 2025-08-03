import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import { getResearchGoalHints } from './utils/toolRelationships';
import { searchGitHubCodeAPI } from '../../utils/githubAPI';
import {
  GitHubCodeSearchQuerySchema,
  GitHubCodeSearchQuery,
  ProcessedCodeSearchResult,
  OptimizedCodeSearchResult,
} from './scheme/github_search_code';

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

interface AggregatedContext {
  foundPackages: Set<string>;
  foundFiles: Set<string>;
  repositoryContexts: Set<string>;
  searchPatterns: Set<string>;
  successfulQueries: number;
  dataQuality: {
    hasContent: boolean;
    hasMatches: boolean;
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
  const errors: Array<{
    queryId: string;
    error: string;
    recoveryHints?: string[];
  }> = [];
  const aggregatedContext: AggregatedContext = {
    foundPackages: new Set<string>(),
    foundFiles: new Set<string>(),
    repositoryContexts: new Set<string>(),
    searchPatterns: new Set<string>(),
    successfulQueries: 0,
    dataQuality: { hasContent: false, hasMatches: false },
  };

  // Execute each query
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    // // Validate query - either queryTerms OR other search filters must be provided
    // const hasQueryTerms = query.queryTerms && query.queryTerms.length > 0;
    // const hasOtherFilters =
    //   query.language ||
    //   query.owner ||
    //   query.repo ||
    //   query.user ||
    //   query.org ||
    //   query.filename ||
    //   query.extension ||
    //   query.path ||
    //   query.size;

    // if (!hasQueryTerms && !hasOtherFilters) {
    //   errors.push({
    //     queryId,
    //     error: `Query ${queryId}: Either queryTerms or search filters (language, owner, repo, etc.) must be provided.`,
    //   });
    //   continue;
    // }

    try {
      // Execute API search
      const result = await searchGitHubCodeAPI(query, opts.ghToken);

      // Check if result is an error with enhanced recovery hints
      if ('error' in result) {
        const recoveryHints = generateErrorRecoveryHints(result.error, query);
        errors.push({
          queryId,
          error: result.error,
          recoveryHints,
        });
        continue;
      }

      // Process successful results
      const searchData = result as CodeSearchAPIResponse;

      // Extract research context
      if (searchData._researchContext) {
        searchData._researchContext.foundPackages?.forEach((pkg: string) =>
          aggregatedContext.foundPackages.add(pkg)
        );
        searchData._researchContext.foundFiles?.forEach((file: string) =>
          aggregatedContext.foundFiles.add(file)
        );
        if (searchData._researchContext.repositoryContext) {
          const { owner, repo } = searchData._researchContext.repositoryContext;
          aggregatedContext.repositoryContexts.add(`${owner}/${repo}`);
        }
      }

      // 5. Process successful results (already processed by githubAPI.ts)
      if (searchData.items) {
        aggregatedContext.successfulQueries++;
        aggregatedContext.dataQuality.hasContent = true;

        searchData.items.forEach(item => {
          // Extract and track search patterns for context
          if (query.queryTerms) {
            query.queryTerms.forEach(term =>
              aggregatedContext.searchPatterns.add(term)
            );
          }

          // Extract matches (already processed by githubAPI.ts)
          const matches = item.matches?.map(match => match.context) || [];

          if (matches.length > 0) {
            aggregatedContext.dataQuality.hasMatches = true;
          }

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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const recoveryHints = generateErrorRecoveryHints(errorMessage, query);
      errors.push({
        queryId,
        error: errorMessage,
        recoveryHints,
      });
    }
  }

  // 6. Generate Context-Aware Smart Hints based on actual response data
  const hints = generateResponseDrivenHints({
    processedResults,
    errors,
    aggregatedContext,
    queries,
  });

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

  // 9. Return via createResult (cached automatically by directCache)
  return createResult(response);
}

/**
 * Generate error recovery hints based on error type and query context
 */
function generateErrorRecoveryHints(
  error: string,
  query: GitHubCodeSearchQuery
): string[] {
  const hints: string[] = [];
  const errorLower = error.toLowerCase();

  if (errorLower.includes('rate limit') || errorLower.includes('403')) {
    hints.push('Rate limited - wait a few minutes before retrying');
    hints.push('Use more specific search terms to reduce API calls');
    hints.push('Consider adding owner/repo filters to narrow search scope');
  } else if (errorLower.includes('not found') || errorLower.includes('404')) {
    hints.push('Repository may be private or non-existent');
    hints.push('Check repository name spelling and accessibility');
    if (query.owner && query.repo) {
      hints.push(
        `Try searching without repo filter: remove repo: "${query.repo}"`
      );
    }
  } else if (errorLower.includes('timeout') || errorLower.includes('network')) {
    hints.push('Network issue - retry the same query');
    hints.push('Try reducing query scope with fewer search terms');
  } else if (
    errorLower.includes('validation') ||
    errorLower.includes('invalid')
  ) {
    hints.push('Check query syntax and required parameters');
    hints.push('Ensure queryTerms array is not empty if provided');
  } else {
    hints.push('Try broader search terms if query is too specific');
    hints.push(
      'Add owner/repo filters to scope search to specific repositories'
    );
  }

  return hints;
}

/**
 * Generate smart hints based on actual response data patterns
 */
function generateResponseDrivenHints({
  processedResults,
  errors,
  aggregatedContext,
  queries,
}: {
  processedResults: ProcessedCodeSearchResult[];
  errors: Array<{ queryId: string; error: string; recoveryHints?: string[] }>;
  aggregatedContext: AggregatedContext;
  queries: GitHubCodeSearchQuery[];
}): string[] {
  const hints: string[] = [];
  const totalItems = processedResults.length;
  const hasResults = totalItems > 0;

  // Research hints based on actual response data
  if (hasResults) {
    // Extract unique repositories for context
    const repositories = new Set(processedResults.map(r => r.repository));
    const uniquePaths = new Set(processedResults.map(r => r.path));

    if (repositories.size === 1) {
      const repo = Array.from(repositories)[0];
      hints.push(
        `All results from ${repo} - use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} with matchString for full context`
      );
    } else if (repositories.size > 1) {
      hints.push(
        `Found code in ${repositories.size} repositories - consider focusing on specific repo`
      );
    }

    // File type analysis
    const fileExtensions = new Set(
      Array.from(uniquePaths)
        .map(path => path.split('.').pop()?.toLowerCase())
        .filter(Boolean)
    );
    if (fileExtensions.size > 1) {
      hints.push(
        `Multiple file types found: ${Array.from(fileExtensions).join(', ')} - filter by extension if needed`
      );
    }

    // Next step recommendations
    hints.push(
      `Use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} to get full file context around matches`
    );
    if (aggregatedContext.searchPatterns.size > 0) {
      const firstPattern = Array.from(aggregatedContext.searchPatterns)[0];
      hints.push(
        `Found "${firstPattern}" patterns - refine search or explore related code`
      );
    }
  } else if (errors.length > 0) {
    // Error hints with recovery actions
    const firstError = errors[0];
    if (firstError.recoveryHints) {
      hints.push(...firstError.recoveryHints);
    }

    // Fallback hints based on query analysis
    const hasSpecificRepo = queries.some(q => q.owner && q.repo);
    if (!hasSpecificRepo) {
      hints.push(
        'Try adding owner/repo filters to search specific repositories'
      );
    }

    const hasComplexQuery = queries.some(
      q => q.queryTerms && q.queryTerms.length > 2
    );
    if (hasComplexQuery) {
      hints.push('Try simpler search terms - start with 1-2 key terms');
    }
  } else {
    // No results, no errors - provide efficient LLM guidance
    const hasFilters = queries.some(
      q => q.language || q.filename || q.extension || q.owner || q.repo
    );
    const hasSpecificTerms = queries.some(
      q => q.queryTerms && q.queryTerms.length > 1
    );

    // Primary recovery strategies
    hints.push('No matches found - try these strategies:');

    if (hasFilters) {
      hints.push(
        '✓ Remove filters to broaden search: remove language/extension/owner/repo filters'
      );
      hints.push(
        '✓ Try fewer specific filters - start with just owner/repo or just language'
      );
    }

    if (hasSpecificTerms) {
      hints.push(
        '✓ Use broader search terms: try single keywords instead of phrases'
      );
      hints.push('✓ Search for function names, class names, or core concepts');
    } else {
      hints.push(
        '✓ Add more search terms: include related keywords or synonyms'
      );
    }

    // Alternative search strategies
    hints.push(
      '✓ Try semantic terms: "authentication", "database", "API" instead of exact code'
    );
    hints.push(
      '✓ Search different repositories: popular libraries or framework repos'
    );

    // Verification steps
    if (queries.some(q => q.owner && q.repo)) {
      hints.push('✓ Verify repository exists and is public');
    } else {
      hints.push(
        '✓ Add specific repository: owner: "username", repo: "repository"'
      );
    }
  }

  // Context-aware research goal hints
  const researchGoal = queries.find(q => q.researchGoal)?.researchGoal;
  if (researchGoal && hasResults) {
    const goalHints = getResearchGoalHints(
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      researchGoal
    );
    hints.push(...goalHints);
  }

  return hints;
}
