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

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with PROGRESSIVE REFINEMENT strategy.

USAGE:
 Find implementations and internal mechanisms
 Locate specific functions, methods, or identifiers  
 Discover usage patterns in code and documentation

PROGRESSIVE REFINEMENT STRATEGY - Start broad, then narrow:
 PHASE 1: DISCOVERY - Start with queryTerms + owner/repo only (no language/extension filters)
 PHASE 2: CONTEXT - Analyze initial results to understand codebase structure
 PHASE 3: TARGETED - Apply specific filters (language, extension, filename) based on findings
 PHASE 4: DEEP-DIVE - Use results to guide more specific searches

STRATEGIC APPROACH - Plan up to 5 queries progressing from broad to specific:
 Query 1: ["core-concept"] + owner/repo (broad discovery)
 Query 2: ["specific-function"] + owner/repo + language (if needed)
 Query 3: ["pattern"] + owner/repo + extension="ext" (documentation)
 Query 4: ["test-example"] + owner/repo + filename="pattern" (examples)
 Query 5: ["config"] + owner/repo + extension="ext" (configuration)

AVOID INITIAL OVER-FILTERING: Don't use language/extension filters in first query unless you know the codebase structure!

TOKEN EFFICIENCY: Auto-minified content, filtered structure, sanitized output`;

const GitHubCodeSearchQuerySchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      'Query description/purpose (e.g., "core-implementation", "documentation-guide", "config-files")'
    ),
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(4)
    .optional()
    .describe(
      'Search terms with AND logic - ALL terms must appear in same file'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Programming language filter (e.g., "language-name", "script-language", "compiled-language")'
    ),
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner name'),
  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository name (use with owner for specific repo)'),
  filename: z
    .string()
    .optional()
    .describe(
      'Target specific filename or pattern (e.g., "README", "test", ".env")'
    ),
  extension: z
    .string()
    .optional()
    .describe('File extension filter (e.g., "md", "js", "yml")'),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe(
      'Search scope: "file" (content search - default), "path" (filename search)'
    ),
  size: z
    .string()
    .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
    .optional()
    .describe(
      'File size filter in KB. Use ">50" for substantial files, "<10" for simple examples'
    ),
  limit: z
    .number()
    .int()
    .min(5)
    .max(20)
    .optional()
    .describe(
      'Maximum results per query (5-20). Higher limits for discovery, lower for targeted searches'
    ),
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
          .min(1)
          .max(5)
          .describe(
            '1-5 progressive refinement queries, starting broad then narrowing. PROGRESSIVE STRATEGY: Query 1 should be broad (queryTerms + owner/repo only), then progressively add filters based on initial findings. Use meaningful id descriptions to track refinement phases.'
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
 * Execute multiple GitHub code search queries sequentially to avoid rate limits.
 *
 * PROGRESSIVE REFINEMENT APPROACH:
 * - PHASE 1: DISCOVERY - Start broad with queryTerms + owner/repo only (no restrictive filters)
 * - PHASE 2: CONTEXT ANALYSIS - Examine initial results to understand codebase structure and file types
 * - PHASE 3: TARGETED SEARCH - Apply specific filters (language, extension, filename) based on findings
 * - PHASE 4: DEEP EXPLORATION - Use insights to guide more focused searches
 *
 * SMART MIXED RESULTS HANDLING:
 * - Each query is processed independently with descriptive IDs tracking refinement phases
 * - Results array contains both successful and failed queries
 * - Failed queries get progressive refinement guidance:
 *    No results: suggests broader search terms and removing filters
 *    Rate limit: suggests starting with fewer, broader queries
 *    Auth issues: provides specific login steps
 *    Repository not found: provides discovery strategies
 *    Over-filtering: suggests removing restrictive filters and starting broad
 * - Summary statistics show total vs successful queries with refinement guidance
 * - User gets complete picture: what worked + what failed + next refinement steps
 *
 * EXAMPLE PROGRESSIVE FLOW:
 * Query 1 (id: "discovery"): ["core-concept"] + owner="owner-name" + repo="repo-name" (broad start)
 * Query 2 (id: "function-focused"): ["function-name", "method-name"] + owner="owner-name" + repo="repo-name" + language="language-name"
 * Query 3 (id: "documentation"): ["feature guide"] + owner="owner-name" + repo="repo-name" + extension="ext"
 * Query 4 (id: "test-examples"): ["core-concept"] + owner="owner-name" + repo="repo-name" + filename="pattern"
 * Query 5 (id: "config-build"): ["core-concept"] + owner="owner-name" + repo="repo-name" + extension="ext"
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
          error: `Query ${queryId}: queryTerms parameter is required and must contain at least one search term. PROGRESSIVE REFINEMENT TIP: Start broad with simple terms ["search-term", "function-name"] + owner/repo, then add filters in subsequent queries based on initial results.`,
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
  // Rate limit with progressive refinement guidance
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return createResult({
      error: `GitHub API rate limit reached. PROGRESSIVE RECOVERY approach:
 START BROADER: Use fewer queries (1-2) with basic terms + owner/repo only
 AVOID OVER-FILTERING: Remove language/extension filters initially  
 PROGRESSIVE EXAMPLE: Query 1: ["search-term"] + owner="owner-name" + repo="repo-name" (discover first)
 Then Query 2: Add specific filters based on Query 1 results

Wait 5-10 minutes, then restart with broad discovery approach.`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status  
3. For private repos: use api_status_check to verify org access
4. Then restart with progressive refinement: start broad with simple queryTerms + owner/repo, then add filters based on results`,
    });
  }

  // Network/timeout with progressive refinement suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. PROGRESSIVE RECOVERY approach:
 START SIMPLE: Use basic queryTerms + owner/repo only (no filters initially)
 SMALLER LIMITS: Use limit=10-15 instead of default 30
 PROGRESSIVE EXAMPLE: ["search-term"] + owner="owner-name" + repo="repo-name" + limit=10
 AVOID COMPLEX FILTERS: Don't use language/extension filters in first query
 Check network connection and retry with broad, simple queries`,
    });
  }

  // Invalid query with progressive refinement fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. PROGRESSIVE REFINEMENT FIXES:
 START SIMPLE: Use basic terms ["search-term", "function-name"] without special characters
 AVOID INITIAL FILTERS: Don't use language/extension filters in first discovery query
 Remove special characters: ()[]{}*?^$|.\\
 Use meaningful query IDs: id="discovery", id="targeted-search"
 PROGRESSIVE EXAMPLE: {id: "discovery", queryTerms: ["search-term"], owner: "owner-name", repo: "repo-name"}`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. PROGRESSIVE DISCOVERY approach:
 VERIFY REPO NAMES: Try github_search_repos to find correct owner/repo names first
 EXAMPLE: owner-name/repo-name, not variation-name/repo-name or alt-org/repo-name
 CHECK COMMON VARIATIONS: org might be different (owner-name vs alt-org vs another-org)
 START BROAD: Try without owner/repo filters if unsure, then narrow down
 PROGRESSIVE EXAMPLE: First verify "owner-name/repo-name" exists, then search ["search-term"] + owner="owner-name" + repo="repo-name"
 Check for typos in owner/repo names`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System recovery:
 Update GitHub CLI: gh extension upgrade
 Retry with strategic filtered queries: add extension/language filters to reduce response complexity
 Use github_search_repos as alternative for repo discovery
 Check gh auth status for authentication
 STRATEGIC APPROACH: Start with simple, well-filtered queries with meaningful IDs`,
    });
  }

  // Generic fallback with progressive refinement strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

PROGRESSIVE REFINEMENT RECOVERY:
PHASE 1: DISCOVERY - Start with simple queryTerms + owner/repo only (no filters)
PHASE 2: CONTEXT - Analyze initial results to understand codebase structure  
PHASE 3: TARGETED - Add specific filters based on findings from Phase 1
PHASE 4: VERIFY - Use github_search_repos if repository access issues

EXAMPLE RECOVERY: ["search-term"] + owner="owner-name" + repo="repo-name" → analyze results → then add language/extension filters`,
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
    // Add each term as a separate argument - GitHub CLI handles AND logic automatically
    params.queryTerms.forEach(term => {
      args.push(term);
    });
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
