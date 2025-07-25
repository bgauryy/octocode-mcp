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

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with progressive refinement strategy.

USAGE:
• Find implementations and internal mechanisms
• Locate specific functions, methods, or identifiers  
• Discover usage patterns in code

SEARCH STRATEGY - PROGRESSIVE REFINEMENT:
1. **START BROAD**: Use 1 precise, literal code term per query (function names, class names, keywords)
2. **Use all 5 queries initially**: Cast a wide net with different single terms
3. **No language filters initially**: Let search find relevant files in any language
4. **Then narrow down**: Based on broad results, add filters (owner, language, file types)
5. **Avoid AND logic initially**: Multiple terms (["term1", "term2"]) require ALL terms in same file

EXAMPLES OF CORRECT BROAD START:
• Good: ["term1"], ["term2"], ["term3"], ["term4"], ["term5"]  
• Bad: ["term1", "term2"] - AND logic too restrictive
• Good: Single meaningful terms that exist in code
• Bad: ["generic", "words"] - terms rarely co-occur in same file

PROGRESSIVE REFINEMENT FLOW:
1. Run 5 broad single-term queries
2. Analyze results to identify key files/patterns
3. Narrow with owner/repo filters for specific repositories
4. Add language filters only after finding relevant files
5. Use specific multi-term queries only when you know terms co-occur

TOKEN EFFICIENCY: Auto-minified content, filtered structure, sanitized output

PHILOSOPHY: Broad discovery first → Progressive refinement → Precision targeting`;

const GitHubCodeSearchQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(4)
    .optional()
    .describe(
      'Search terms with AND logic - ALL terms must appear in same file. PROGRESSIVE STRATEGY: Start with 1 term per query for broad discovery. Use multiple terms only when you know they co-occur in code (e.g., function name + unique parameter). Avoid generic combinations.'
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
          .min(1)
          .max(5)
          .describe(
            '1-5 search queries executed in parallel. PROGRESSIVE STRATEGY: Start with 5 broad single-term queries for discovery, then narrow with focused searches based on results.'
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
 * Execute multiple GitHub code search queries in parallel.
 *
 * PROGRESSIVE REFINEMENT STRATEGY:
 * - PHASE 1: Broad Discovery - Use 5 single-term queries without filters
 * - PHASE 2: Pattern Analysis - Identify key files, repositories, languages
 * - PHASE 3: Targeted Search - Add specific filters based on Phase 1 results
 * - PHASE 4: Precision Queries - Use multi-term queries for known co-occurrences
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
 * EXAMPLE PROGRESSIVE FLOW:
 * Phase 1: ["term1"], ["term2"], ["term3"], ["term4"], ["term5"]
 * Phase 2: Analyze results → identify relevant patterns
 * Phase 3: Add owner filters → ["term1", owner: "target_owner"], ["term2", owner: "repo_owner"]
 * Phase 4: Precision → ["term1", "specific_param"] (known co-occurrence)
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
          error: `Query ${queryId}: queryTerms parameter is required and must contain at least one search term. PROGRESSIVE TIP: Start with single broad terms like ["term1"] or ["term2"]`,
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
      error: `GitHub API rate limit reached. PROGRESSIVE STRATEGY recovery:
• PHASE 1: Wait 5-10 minutes, then restart with 5 broad single-term queries
• PHASE 2: Use owner/repo filters to narrow scope: owner="target_owner" 
• PHASE 3: Try npm package search for package-related queries
• PHASE 4: Use separate sequential searches instead of parallel queries

Example restart: ["term1"], ["term2"], ["term3"], ["term4"], ["term5"]`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status  
3. For private repos: use api_status_check to verify org access
4. Then restart with broad discovery queries: ["term1"], ["term2"]`,
    });
  }

  // Network/timeout with fallback suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. PROGRESSIVE RECOVERY strategy:
• PHASE 1: Reduce scope - start with single-term queries: ["term1"]
• PHASE 2: Add owner filter after success: ["term1", owner: "target_owner"]
• PHASE 3: Use github_search_repos to find repositories first
• PHASE 4: Try npm package search for package discovery
• Check network connection and retry with simpler queries`,
    });
  }

  // Invalid query with specific fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. PROGRESSIVE FIXES:
• PHASE 1: Start simple - single terms: ["term1"] not ["term1", "term2"]  
• Remove special characters: ()[]{}*?^$|.\\
• Use quotes only for exact phrases: "exact phrase"
• Avoid escaped quotes: use term instead of "term"
• PROGRESSIVE EXAMPLE: Start ["term1"] → then ["term1.method"] → then ["methodName"]`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. PROGRESSIVE DISCOVERY strategies:
• PHASE 1: Remove owner/repo filters, search broadly: ["term1"]
• PHASE 2: Use github_search_repos to find correct names
• PHASE 3: Check for typos in owner/repo names  
• PHASE 4: Use npm package search if looking for packages
• Example: ["term1"] → find owner/repo → ["term1", owner: "target_owner"]`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System recovery:
• Update GitHub CLI: gh extension upgrade
• Retry with simpler broad queries: ["term1"], ["term2"]
• Use github_search_repos as alternative for repo discovery
• Check gh auth status for authentication
• Start with single-term queries to reduce response complexity`,
    });
  }

  // Generic fallback with progressive strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

PROGRESSIVE RECOVERY STRATEGY:
PHASE 1: Restart broad - Use 5 single-term queries: ["term1"], ["term2"], ["term3"], ["term4"], ["term5"]
PHASE 2: Analyze results to identify patterns and key repositories  
PHASE 3: Add specific filters based on successful Phase 1 results
PHASE 4: Use github_search_repos for repository discovery if needed`,
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
