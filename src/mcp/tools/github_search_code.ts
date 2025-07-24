/* eslint-disable no-console */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchItem, OptimizedCodeSearchResult } from '../../types';
import {
  createResult,
  simplifyRepoUrl,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { minifyContentV2 } from '../../utils/minifier';

export const GITHUB_SEARCH_CODE_TOOL_NAME = 'githubSearchCode';

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with progressive refinement.

USAGE:
• Find implementations and internal mechanisms
• Locate specific functions, methods, or identifiers
• Discover usage patterns in code

SEARCH STRATEGY:
1. Use 1–2 precise, literal code terms per query that are likely to appear together (e.g., identifiers, keywords, filenames)
2. Avoid abstract or semantic terms in code search (e.g., "implementation", "feature")—they rarely appear in source files
3. When targeting documentation or high-level context, semantic terms are valid and useful
4. For robust coverage, pair semantic-oriented queries with literal-term queries targeting code
5. Execute up to 5 parallel queries—balance coverage and precision across them

TOKEN EFFICIENCY: Auto-minified content, filtered structure, sanitized output

PHILOSOPHY: Literal code terms for precision + semantic fallback for context = complete and effective search`;

const GitHubCodeSearchQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(4)
    .optional()
    .describe(
      'Search terms with AND logic - ALL terms must appear in same file. Use 1-2 specific terms that actually co-occur in code (function names, variable names, keywords). Avoid generic words or long phrases.'
    ),
  language: z.string().optional().describe('Programming language filter'),
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner/organization name'),
  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository name (use with owner for specific repo)'),
  filename: z
    .string()
    .optional()
    .describe('Target specific filename or pattern'),
  extension: z.string().optional().describe('File extension filter'),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe('Search scope: file (content) or path (filenames)'),
  size: z
    .string()
    .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
    .optional()
    .describe('File size filter in KB'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results per query (1-100)'),
  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),
  minify: z
    .boolean()
    .optional()
    .default(true)
    .describe('Optimize content for token efficiency (default: true)'),
  sanitize: z
    .boolean()
    .optional()
    .default(true)
    .describe('Remove secrets and malicious content (default: true)'),
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export interface GitHubCodeSearchQueryResult {
  queryId: string;
  originalQuery: GitHubCodeSearchQuery;
  result: OptimizedCodeSearchResult;
  error?: string;
}

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_CODE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(GitHubCodeSearchQuerySchema)
          .min(3)
          .max(5)
          .describe('Up to 5 search queries executed in parallel'),
      },
      annotations: {
        title: 'GitHub Code Search - Parallel Queries',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: GitHubCodeSearchQuery[];
      }): Promise<CallToolResult> => {
        try {
          return await searchMultipleGitHubCode(args.queries);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return createResult({
            error: `Failed to search code: ${errorMessage}. Try broader search terms or check repository access.`,
          });
        }
      }
    )
  );
}

/**
 * Execute multiple GitHub code search queries in parallel.
 *
 * SMART MIXED RESULTS HANDLING:
 * - Each query is processed independently
 * - Results array contains both successful and failed queries
 * - Failed queries get smart error messages with fallback hints:
 *   • Rate limit: suggests timing and alternative strategies
 *   • Auth issues: provides specific login steps
 *   • Invalid queries: suggests query format fixes
 *   • Repository not found: provides discovery strategies
 *   • Network timeouts: suggests scope reduction
 * - Summary statistics show total vs successful queries
 * - User gets complete picture: what worked + what failed + how to fix
 *
 * EXAMPLE MIXED RESULT:
 * Query 1: Success → Returns code results
 * Query 2: Rate limit → Smart error with timing guidance
 * Query 3: Success → Returns code results
 * Query 4: Repo not found → Smart error with discovery hints
 *
 * Result: 4 total queries, 2 successful, with actionable error messages
 */
async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[]
): Promise<CallToolResult> {
  const results: GitHubCodeSearchQueryResult[] = [];

  // Execute queries sequentially to avoid rate limits
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    try {
      // Validate single query
      const hasQueryTerms = query.queryTerms && query.queryTerms.length > 0;

      if (!hasQueryTerms) {
        results.push({
          queryId,
          originalQuery: query,
          result: { items: [], total_count: 0 },
          error: `Query ${queryId}: queryTerms parameter is required and must contain at least one search term`,
        });
        continue;
      }

      // Execute the query
      const result = await searchGitHubCode(query);

      if (!result.isError) {
        // Success
        const execResult = JSON.parse(result.content[0].text as string);
        const codeResults: GitHubCodeSearchItem[] = execResult.result;
        const items = Array.isArray(codeResults) ? codeResults : [];
        const optimizedResult = await transformToOptimizedFormat(
          items,
          query.minify !== false,
          query.sanitize !== false
        );

        results.push({
          queryId,
          originalQuery: query,
          result: optimizedResult,
        });
      } else {
        // Error
        results.push({
          queryId,
          originalQuery: query,
          result: { items: [], total_count: 0 },
          error: result.content[0].text as string,
        });
      }
    } catch (error) {
      // Handle any unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      results.push({
        queryId,
        originalQuery: query,
        result: { items: [], total_count: 0 },
        error: `Unexpected error: ${errorMessage}`,
      });
    }
  }

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(r => !r.error).length;
  const failedQueries = results.filter(r => r.error).length;

  // Create smart summary with mixed results guidance
  const summary: any = {
    totalQueries,
    successfulQueries,
    failedQueries,
  };

  // Add guidance for mixed results scenarios
  if (successfulQueries > 0 && failedQueries > 0) {
    summary.mixedResults = true;
    summary.guidance = [
      `${successfulQueries} queries succeeded - check results for code findings`,
      `${failedQueries} queries failed - check error messages for specific fixes`,
      `Review individual query errors for actionable next steps`,
    ];
  } else if (failedQueries === totalQueries) {
    summary.allFailed = true;
    summary.guidance = [
      `All ${totalQueries} queries failed`,
      `Check error messages for specific fixes (auth, rate limits, query format)`,
      `Try simpler queries or different search strategies`,
    ];
  } else if (successfulQueries === totalQueries) {
    summary.allSucceeded = true;
    summary.guidance = [
      `All ${totalQueries} queries succeeded`,
      `Check individual results for code findings`,
    ];
  }

  return createResult({
    data: {
      results,
      summary,
    },
  });
}

/**
 * Handles various search errors and returns a formatted CallToolResult with smart fallbacks.
 */
function handleSearchError(errorMessage: string): CallToolResult {
  // Rate limit with smart timing guidance
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return createResult({
      error: `GitHub API rate limit reached. Try again in 5-10 minutes, or use these strategies:
• Search fewer terms per query
• Use owner/repo filters to narrow scope
• Try npm package search for package-related queries
• Use separate searches instead of complex queries`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status
3. For private repos: use api_status_check to verify org access`,
    });
  }

  // Network/timeout with fallback suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. Try these alternatives:
• Reduce search scope with owner or language filters
• Use github_search_repos to find repositories first
• Try npm package search for package discovery
• Check network connection and retry`,
    });
  }

  // Invalid query with specific fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. Common fixes:
• Remove special characters: ()[]{}*?^$|.\\
• Use quotes only for exact phrases: "error handling"
• Avoid escaped quotes: use term instead of "term"
• Try broader terms: "react" instead of "React.Component"`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. Discovery strategies:
• Use github_search_repos to find correct names
• Check for typos in owner/repo names
• Try without owner filter for broader search
• Use npm package search if looking for packages`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System issue - try:
• Update GitHub CLI: gh extension upgrade
• Retry in a few moments
• Use github_search_repos as alternative
• Check gh auth status for authentication`,
    });
  }

  // Generic fallback with progressive strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

Progressive recovery strategy:
1. Try broader search terms
2. Use github_search_repos to find repositories
3. Use npm package search for package-related queries
4. Check github CLI status: gh auth status`,
  });
}

/**
 * Transform GitHub CLI response to optimized format with enhanced metadata
 */
async function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[],
  minify: boolean,
  sanitize: boolean
): Promise<OptimizedCodeSearchResult> {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  // Track security warnings and minification metadata
  const allSecurityWarnings: string[] = [];
  let hasMinificationFailures = false;
  const minificationTypes: string[] = [];

  const optimizedItems = await Promise.all(
    items.map(async item => {
      const processedMatches = await Promise.all(
        (item.textMatches || []).map(async match => {
          let processedFragment = match.fragment;

          // Apply sanitization first if enabled
          if (sanitize) {
            const sanitizationResult =
              ContentSanitizer.sanitizeContent(processedFragment);
            processedFragment = sanitizationResult.content;

            // Collect security warnings
            if (sanitizationResult.hasSecrets) {
              allSecurityWarnings.push(
                `Secrets detected in ${item.path}: ${sanitizationResult.secretsDetected.join(', ')}`
              );
            }
            if (sanitizationResult.hasPromptInjection) {
              allSecurityWarnings.push(
                `Prompt injection detected in ${item.path}`
              );
            }
            if (sanitizationResult.isMalicious) {
              allSecurityWarnings.push(
                `Malicious content detected in ${item.path}`
              );
            }
            if (sanitizationResult.warnings.length > 0) {
              allSecurityWarnings.push(
                ...sanitizationResult.warnings.map(w => `${item.path}: ${w}`)
              );
            }
          }

          // Apply minification if enabled
          if (minify) {
            const minifyResult = await minifyContentV2(
              processedFragment,
              item.path
            );
            processedFragment = minifyResult.content;

            if (minifyResult.failed) {
              hasMinificationFailures = true;
            } else if (minifyResult.type !== 'failed') {
              minificationTypes.push(minifyResult.type);
            }
          }

          return {
            context: optimizeTextMatch(processedFragment, 120),
            positions:
              match.matches?.map(m =>
                Array.isArray(m.indices) && m.indices.length >= 2
                  ? ([m.indices[0], m.indices[1]] as [number, number])
                  : ([0, 0] as [number, number])
              ) || [],
          };
        })
      );

      return {
        path: item.path,
        matches: processedMatches,
        url: singleRepo ? item.path : simplifyGitHubUrl(item.url),
        repository: {
          nameWithOwner: item.repository.nameWithOwner,
          url: item.repository.url,
        },
      };
    })
  );

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: simplifyRepoUrl(singleRepo.url),
    };
  }

  // Add processing metadata
  if (sanitize && allSecurityWarnings.length > 0) {
    result.securityWarnings = [...new Set(allSecurityWarnings)]; // Remove duplicates
  }

  if (minify) {
    result.minified = !hasMinificationFailures;
    result.minificationFailed = hasMinificationFailures;
    if (minificationTypes.length > 0) {
      result.minificationTypes = [...new Set(minificationTypes)]; // Remove duplicates
    }
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Build command line arguments for GitHub CLI following the exact CLI format.
 * Uses proper flags (--flag=value) for filters and direct query terms.
 */
export function buildGitHubCliArgs(params: GitHubCodeSearchQuery): string[] {
  const args: string[] = ['code'];

  // Add query terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    // Properly quote each term for AND logic - all terms must be present
    const quotedTerms = params.queryTerms.map(term => `"${term}"`).join(' ');
    args.push(quotedTerms);
  }

  // Add filters
  if (params.language) {
    args.push(`--language=${params.language}`);
  }

  // Handle owner/repo combination
  if (params.owner && params.repo) {
    const ownerStr = Array.isArray(params.owner)
      ? params.owner[0]
      : params.owner;
    const repoStr = Array.isArray(params.repo) ? params.repo[0] : params.repo;
    args.push(`--repo=${ownerStr}/${repoStr}`);
  } else if (params.owner) {
    const ownerStr = Array.isArray(params.owner)
      ? params.owner[0]
      : params.owner;
    args.push(`--owner=${ownerStr}`);
  }

  if (params.filename) {
    args.push(`--filename=${params.filename}`);
  }

  if (params.extension) {
    args.push(`--extension=${params.extension}`);
  }

  if (params.size) {
    args.push(`--size=${params.size}`);
  }

  if (params.match) {
    args.push(`--match=${params.match}`);
  }

  if (params.visibility) {
    args.push(`--visibility=${params.visibility}`);
  }

  // Add limit (default 30 if not specified)
  const limit = Math.min(params.limit || 30, 100);
  args.push(`--limit=${limit}`);

  // Add JSON output
  args.push('--json');
  args.push('repository,path,textMatches,sha,url');

  return args;
}

export async function searchGitHubCode(
  params: GitHubCodeSearchQuery
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const args = buildGitHubCliArgs(params);

      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      return handleSearchError(errorMessage);
    }
  });
}
