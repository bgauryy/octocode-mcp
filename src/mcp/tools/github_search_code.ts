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
import {
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
} from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';

const DESCRIPTION = `PURPOSE: Search code across GitHub repositories with strategic query planning.

SEARCH STRATEGY:
SEMANTIC: Natural language terms describing functionality, concepts, business logic
TECHNICAL: Actual code terms, function names, class names, file patterns

Use bulk queries from different angles. Start narrow, broaden if needed.
Workflow: Search → Use ${GITHUB_GET_FILE_CONTENT_TOOL_NAME} with matchString for context.

Progressive queries: Core terms → Specific patterns → Documentation → Configuration → Alternatives`;

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
    .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
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
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Maximum results per query (1-20). Higher limits for discovery, lower for targeted searches'
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
            args.verbose ?? false
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

  // Extract packages and dependencies from code matches
  const foundPackages = new Set<string>();
  const foundFiles = new Set<string>();

  const optimizedItems = await Promise.all(
    items.map(async item => {
      // Track found files for deeper research
      foundFiles.add(item.path);

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
    // Add research context for smart hints
    _researchContext: {
      foundPackages: Array.from(foundPackages),
      foundFiles: Array.from(foundFiles),
      repositoryContext: singleRepo
        ? {
            owner: singleRepo.nameWithOwner.split('/')[0],
            repo: singleRepo.nameWithOwner.split('/')[1],
          }
        : undefined,
    },
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
 * Execute multiple GitHub code search queries sequentially to avoid rate limits.
 *
 * PROGRESSIVE REFINEMENT APPROACH:
 * - PHASE 1: DISCOVERY - Start broad with queryTerms + owner/repo only (no restrictive filters)
 * - PHASE 2: CONTEXT ANALYSIS - Examine initial results to understand codebase structure and file types
 * - PHASE 3: TARGETED SEARCH - Apply specific filters (language, extension, filename) based on findings
 * - PHASE 4: DEEP EXPLORATION - Use insights to guide more focused searches
 */
async function searchMultipleGitHubCode(
  queries: GitHubCodeSearchQuery[],
  verbose: boolean = false
): Promise<CallToolResult> {
  // Execute all queries and collect results
  const queryResults = await executeQueriesAndCollectResults(queries);

  // Process successful results and extract research context
  const { processedResults, aggregatedContext } =
    await processQueryResults(queryResults);

  // Generate all hints in one place
  const hints = generateAllHints(queryResults, aggregatedContext);

  // Create final response
  return createFinalResponse(processedResults, hints, queryResults, verbose);
}

/**
 * Execute all queries and collect raw results with error handling
 */
async function executeQueriesAndCollectResults(
  queries: GitHubCodeSearchQuery[]
): Promise<GitHubCodeSearchQueryResult[]> {
  const results: GitHubCodeSearchQueryResult[] = [];

  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const queryId = query.id || `query_${index + 1}`;

    // Validate query
    if (!query.queryTerms || query.queryTerms.length === 0) {
      results.push({
        queryId,
        originalQuery: query,
        result: { items: [], total_count: 0 },
        error: `Query ${queryId}: queryTerms parameter is required and must contain at least one search term.`,
      });
      continue;
    }

    try {
      const result = await searchGitHubCode(query);

      if (result.isError) {
        results.push({
          queryId,
          originalQuery: query,
          result: { items: [], total_count: 0 },
          error: result.content[0].text as string,
        });
      } else {
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
      }
    } catch (error) {
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

  return results;
}

/**
 * Process successful results and extract aggregated research context
 */
async function processQueryResults(
  queryResults: GitHubCodeSearchQueryResult[]
) {
  const processedResults: any[] = [];
  const aggregatedContext = {
    foundPackages: new Set<string>(),
    foundFiles: new Set<string>(),
    repositoryContexts: new Set<string>(),
  };

  queryResults.forEach(result => {
    if (!result.error && result.result.items) {
      // Collect research context from results
      if (result.result._researchContext) {
        result.result._researchContext.foundPackages?.forEach(pkg =>
          aggregatedContext.foundPackages.add(pkg)
        );
        result.result._researchContext.foundFiles?.forEach(file =>
          aggregatedContext.foundFiles.add(file)
        );
        if (result.result._researchContext.repositoryContext) {
          const { owner, repo } =
            result.result._researchContext.repositoryContext;
          aggregatedContext.repositoryContexts.add(`${owner}/${repo}`);
        }
      }

      // Convert to flattened format for response
      result.result.items.forEach(item => {
        const matches = item.matches.map(match => match.context);
        processedResults.push({
          queryId: result.queryId,
          repository: item.repository.nameWithOwner,
          path: item.path,
          matches: matches,
          repositoryInfo: {
            nameWithOwner: item.repository.nameWithOwner,
          },
        });
      });
    }
  });

  return { processedResults, aggregatedContext };
}

/**
 * Generate all hints using the centralized smart hint system
 */
function generateAllHints(
  queryResults: GitHubCodeSearchQueryResult[],
  aggregatedContext: {
    foundPackages: Set<string>;
    foundFiles: Set<string>;
    repositoryContexts: Set<string>;
  }
): string[] {
  const totalItems = queryResults.reduce(
    (sum, r) => sum + (r.error ? 0 : r.result.items.length),
    0
  );

  const hasResults = totalItems > 0;
  const errorMessages = queryResults.filter(r => r.error).map(r => r.error!);
  const errorMessage = errorMessages.length > 0 ? errorMessages[0] : undefined;

  // Use the centralized smart hints system from toolRelationships
  return generateSmartHints(GITHUB_SEARCH_CODE_TOOL_NAME, {
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
}

/**
 * Create the final response with consistent structure
 */
function createFinalResponse(
  processedResults: any[],
  hints: string[],
  queryResults: GitHubCodeSearchQueryResult[],
  verbose: boolean
): CallToolResult {
  let data:
    | typeof processedResults
    | { data: typeof processedResults; metadata: object } = processedResults;

  // Add metadata only if verbose mode is enabled
  if (verbose) {
    const successfulQueries = queryResults.filter(r => !r.error).length;
    const failedQueries = queryResults.filter(r => r.error).length;
    const totalQueries = queryResults.length;

    data = {
      data: processedResults,
      metadata: {
        queries: queryResults,
        summary: {
          totalQueries,
          successfulQueries,
          failedQueries,
          totalCodeItems: processedResults.length,
        },
      },
    };
  }

  return createResult({ data, hints });
}

/**
 * Simplified error handling for individual search operations
 */
function formatSearchError(errorMessage: string): string {
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return 'Rate limit reached. Wait 5-10 minutes. Use 2-3 focused queries with core technical + semantic terms.';
  }
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return "Authentication required: Run 'gh auth login' then retry search";
  }
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return 'Network timeout: Check connection, reduce query limit to 10-15, use simpler terms';
  }
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return 'Invalid query: Remove special characters, use simple terms';
  }
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return 'Repository not found: Use github_search_repos to find correct owner/repo names';
  }
  if (errorMessage.includes('JSON')) {
    return "Parsing failed: Update GitHub CLI, check 'gh auth status', try simpler queries";
  }
  return `Search failed: ${errorMessage}. Try broader semantic + technical terms.`;
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
    // Handle owner arrays by creating multiple --owner flags
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach((owner: string) => args.push(`--owner=${owner}`));
  } else if (params.repo) {
    // Handle standalone repo arrays
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    repos.forEach((repo: string) => args.push(`--repo=${repo}`));
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
    // Handle match arrays by creating multiple --match flags
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach((match: string) => args.push(`--match=${match}`));
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
      return await executeGitHubCommand('search', args, { cache: false });
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      const formattedError = formatSearchError(errorMessage);

      return createResult({
        isError: true,
        hints: [formattedError],
      });
    }
  });
}
