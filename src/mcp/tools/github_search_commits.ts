import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCommitSearchParams,
  GitHubCommitSearchItem,
  OptimizedCommitSearchResult,
} from '../../types';
import {
  createResult,
  simplifyRepoUrl,
  toDDMMYYYY,
  getCommitTitle,
} from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import {
  createAuthenticationError,
  createRateLimitError,
  createNoResultsError,
  createSearchFailedError,
} from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { GitHubCommitsSearchBuilder } from './utils/GitHubCommandBuilder';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { GITHUB_SEARCH_COMMITS_TOOL_NAME } from './utils/toolConstants';

const DESCRIPTION = `PURPOSE: Search commits by message, author, hash, or date for code evolution.

USAGE:
 Track code changes over time
 Find commits by author or message
 Get SHAs for github_fetch_content

KEY FEATURES:
 Query combinations (exactQuery, queryTerms, orTerms)
 Filter-only search (author, hash, date)
 Optional diff content (getChangesContent)

EXAMPLES:
 exactQuery="bug fix"
 hash="<sha from PR>"
 committer="username"

TOKEN WARNING:
 getChangesContent=true is EXPENSIVE
 Use github_fetch_content for full files

PHILOSOPHY: Build comprehensive understanding progressively`;

export function registerGitHubSearchCommitsTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_COMMITS_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        exactQuery: z
          .string()
          .optional()
          .describe(
            'Exact phrase to search for in commit messages (e.g., "bug fix")'
          ),

        queryTerms: z
          .array(z.string())
          .optional()
          .describe(
            'Array of search terms with AND logic (e.g., ["readme", "typo"] finds commits with both words)'
          ),

        orTerms: z
          .array(z.string())
          .optional()
          .describe(
            'Array of search terms with OR logic (e.g., ["bug", "fix"] finds commits with either word)'
          ),

        // Repository filters
        owner: z
          .string()
          .optional()
          .describe('Repository owner (use with repo param)'),
        repo: z
          .string()
          .optional()
          .describe('Repository name (use with owner param)'),

        // Author filters
        author: z
          .string()
          .optional()
          .describe('GitHub username of commit author (e.g., "octocat")'),
        'author-name': z
          .string()
          .optional()
          .describe('Full name of commit author'),
        'author-email': z
          .string()
          .optional()
          .describe('Email of commit author'),

        // Committer filters
        committer: z
          .string()
          .optional()
          .describe('GitHub username of committer (e.g., "monalisa")'),
        'committer-name': z
          .string()
          .optional()
          .describe('Full name of committer'),
        'committer-email': z.string().optional().describe('Email of committer'),

        // Date filters
        'author-date': z
          .string()
          .optional()
          .describe(
            'Filter by author date (e.g., "<2022-02-01", ">2020-01-01", "2020-01-01..2021-01-01")'
          ),
        'committer-date': z
          .string()
          .optional()
          .describe(
            'Filter by commit date (e.g., "<2022-02-01", ">2020-01-01", "2020-01-01..2021-01-01")'
          ),

        // Hash filters
        hash: z
          .string()
          .optional()
          .describe(
            'Commit SHA (full or partial, including head_sha/base_sha from a PR as returned by github_search_pull_requests)'
          ),
        parent: z.string().optional().describe('Parent commit SHA'),
        tree: z.string().optional().describe('Tree SHA'),

        // State filters
        merge: z
          .boolean()
          .optional()
          .describe('Only merge commits (true) or exclude them (false)'),

        // Visibility
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter'),

        // Pagination and sorting
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Maximum number of results to fetch'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Sort by date field'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order'),
        getChangesContent: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Set to true to fetch actual commit changes (diffs/patches). Works for both public and private repositories, most effective with owner and repo specified. Limited to first 10 commits for rate limiting. WARNING: EXTREMELY expensive in tokens - each commit diff can consume thousands of tokens.'
          ),
      },
      annotations: {
        title: 'GitHub Commit Search - Smart & Effective',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubCommitSearchParams): Promise<CallToolResult> => {
        // Validate search parameters
        const hasExactQuery = !!args.exactQuery;
        const hasQueryTerms = args.queryTerms && args.queryTerms.length > 0;
        const hasOrTerms = args.orTerms && args.orTerms.length > 0;

        // Check if any filters are provided
        const hasFilters = !!(
          args.author ||
          args.committer ||
          args['author-name'] ||
          args['committer-name'] ||
          args['author-email'] ||
          args['committer-email'] ||
          args.hash ||
          args.parent ||
          args.tree ||
          args['author-date'] ||
          args['committer-date'] ||
          args.merge !== undefined ||
          args.visibility ||
          (args.owner && args.repo)
        );

        // Allow search with just filters (no query required)
        if (!hasExactQuery && !hasQueryTerms && !hasOrTerms && !hasFilters) {
          return createResult({
            error:
              'At least one search parameter required: exactQuery, queryTerms, orTerms, or filters (author, committer, hash, date, etc.)',
          });
        }

        if (hasExactQuery && (hasQueryTerms || hasOrTerms)) {
          return createResult({
            error:
              'exactQuery cannot be combined with queryTerms or orTerms. Use exactQuery alone or combine queryTerms + orTerms.',
          });
        }

        try {
          const result = await searchGitHubCommits(args);

          if (result.isError) {
            return result;
          }

          const execResult = JSON.parse(result.content[0].text as string);
          const commits: GitHubCommitSearchItem[] = execResult.result;

          // GitHub CLI returns a direct array
          const items = Array.isArray(commits) ? commits : [];

          // Smart handling for no results - provide actionable suggestions
          if (items.length === 0) {
            // Progressive simplification strategy based on current search complexity
            const simplificationSteps: string[] = [];
            let hasFilters = false;

            // Check for active filters
            const activeFilters = [];
            if (args.owner && args.repo) activeFilters.push('repo');
            if (args.author) activeFilters.push('author');
            if (args['author-email']) activeFilters.push('author-email');
            if (args.hash) activeFilters.push('hash');
            if (args['author-date']) activeFilters.push('date');
            if (args.visibility) activeFilters.push('visibility');

            hasFilters = activeFilters.length > 0;

            // Step 1: Suggest using queryTerms for broader search if using exactQuery
            if (args.exactQuery) {
              const words = args.exactQuery.trim().split(' ');
              if (words.length > 1) {
                simplificationSteps.push(
                  `Try queryTerms instead: ["${words[0]}", "${words[1]}"] for broader results`
                );
              }
            }

            // Step 2: Suggest separate searches for OR operations
            if (args.queryTerms && args.queryTerms.length > 2) {
              const simplified = args.queryTerms.slice(0, 2);
              simplificationSteps.push(
                `Try fewer terms: ["${simplified.join('", "')}"] instead of ${args.queryTerms.length} terms`
              );
            }

            // Step 3: Remove filters progressively
            if (hasFilters) {
              if (activeFilters.length > 1) {
                simplificationSteps.push(
                  `Remove some filters (currently: ${activeFilters.join(', ')}) and keep only the most important one`
                );
              } else {
                simplificationSteps.push(
                  `Remove the ${activeFilters[0]} filter and search more broadly`
                );
              }
            }

            // Step 4: Alternative approaches for OR operations
            if (!args.exactQuery && !args.queryTerms && hasFilters) {
              simplificationSteps.push(
                'Add search terms: use queryTerms: ["term1", "term2"] with your filters'
              );
            }

            // Step 5: Suggest using separate searches for OR operations
            if (args.queryTerms && args.queryTerms.length === 1) {
              simplificationSteps.push(
                'For OR operations, run separate searches for each term instead of complex queries'
              );
            }

            // Step 6: Ask for user guidance if no obvious simplification
            if (simplificationSteps.length === 0) {
              simplificationSteps.push(
                "Try different keywords or ask the user to be more specific about what commits they're looking for"
              );
            }

            return createResult({
              error: `${createNoResultsError('commits')}

Try these simplified searches:
${simplificationSteps.map(step => ` ${step}`).join('\n')}

Or ask the user:
 "What specific type of commits are you looking for?" 
 "Can you provide different keywords to search for?"
 "Should I search in a specific repository instead?"

Search techniques to try:
 Use exactQuery for phrases: "bug fix", "exact phrase"
 Use queryTerms for multiple terms: ["term1", "term2"] (AND logic)
 For OR operations: run separate searches for each term
 Combine with filters: author, repo, date filters

Alternative tools:
 Use github_search_code for file-specific commits
 Use github_search_repos to find repositories first`,
            });
          }

          // Transform to optimized format
          const optimizedResult = await transformCommitsToOptimizedFormat(
            items,
            args
          );

          return createResult({ data: optimizedResult });
        } catch (error) {
          const errorMessage = (error as Error).message || '';

          if (errorMessage.includes('authentication')) {
            return createResult({
              error: createAuthenticationError(),
            });
          }

          if (errorMessage.includes('rate limit')) {
            return createResult({
              error: createRateLimitError(false),
            });
          }

          return createResult({
            error: createSearchFailedError('commits'),
          });
        }
      }
    )
  );
}

/**
 * Transform GitHub CLI response to optimized format
 */
async function transformCommitsToOptimizedFormat(
  items: GitHubCommitSearchItem[],
  params: GitHubCommitSearchParams
): Promise<OptimizedCommitSearchResult> {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  // Fetch diff information if requested and this is a repo-specific search
  const shouldFetchDiff =
    params.getChangesContent && params.owner && params.repo;
  const diffData: Map<string, any> = new Map();

  if (shouldFetchDiff && items.length > 0) {
    // Fetch diff info for each commit (limit to first 10 to avoid rate limits)
    const commitShas = items.slice(0, 10).map(item => item.sha);
    const diffPromises = commitShas.map(async (sha: string) => {
      try {
        const diffResult = await executeGitHubCommand(
          'api',
          [`/repos/${params.owner}/${params.repo}/commits/${sha}`],
          { cache: false }
        );
        if (!diffResult.isError) {
          const diffExecResult = JSON.parse(
            diffResult.content[0].text as string
          );
          return { sha, commitData: diffExecResult.result };
        }
      } catch (e) {
        // Ignore diff fetch errors
      }
      return { sha, commitData: null };
    });

    const diffResults = await Promise.all(diffPromises);
    diffResults.forEach(({ sha, commitData }) => {
      if (commitData) {
        diffData.set(sha, commitData);
      }
    });
  }

  const optimizedCommits = items
    .map(item => {
      // Sanitize commit message
      const rawMessage = getCommitTitle(item.commit?.message ?? '');
      const messageSanitized = ContentSanitizer.sanitizeContent(rawMessage);
      const warningsCollector: string[] = [...messageSanitized.warnings];

      const commitObj: any = {
        sha: item.sha, // Use as branch parameter in github_fetch_content
        message: messageSanitized.content,
        author: item.commit?.author?.name ?? item.author?.login ?? 'Unknown',
        date: toDDMMYYYY(item.commit?.author?.date ?? ''),
        repository: singleRepo
          ? undefined
          : simplifyRepoUrl(item.repository?.url || ''),
        url: singleRepo
          ? item.sha
          : `${simplifyRepoUrl(item.repository?.url || '')}@${item.sha}`,
      };

      // Add security warnings if any were detected
      if (warningsCollector.length > 0) {
        commitObj._sanitization_warnings = warningsCollector;
      }

      // Add diff information if available
      if (shouldFetchDiff && diffData.has(item.sha)) {
        const commitData = diffData.get(item.sha);
        const files = commitData.files || [];
        commitObj.diff = {
          changed_files: files.length,
          additions: commitData.stats?.additions || 0,
          deletions: commitData.stats?.deletions || 0,
          total_changes: commitData.stats?.total || 0,
          files: files
            .map((f: any) => {
              const fileObj: any = {
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                changes: f.changes,
              };

              // Sanitize patch content if present
              if (f.patch) {
                const rawPatch =
                  f.patch.substring(0, 1000) +
                  (f.patch.length > 1000 ? '...' : '');
                const patchSanitized =
                  ContentSanitizer.sanitizeContent(rawPatch);
                fileObj.patch = patchSanitized.content;

                // Collect patch sanitization warnings
                if (patchSanitized.warnings.length > 0) {
                  warningsCollector.push(
                    ...patchSanitized.warnings.map(w => `[${f.filename}] ${w}`)
                  );
                }
              }

              return fileObj;
            })
            .slice(0, 5), // Limit to 5 files per commit
        };

        // Update warnings if patch sanitization added any
        if (
          warningsCollector.length >
          (commitObj._sanitization_warnings?.length || 0)
        ) {
          commitObj._sanitization_warnings = warningsCollector;
        }
      }

      return commitObj;
    })
    .map(commit => {
      // Remove undefined fields
      const cleanCommit: Record<string, unknown> = {};
      Object.entries(commit).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanCommit[key] = value;
        }
      });
      return cleanCommit;
    });

  const result: OptimizedCommitSearchResult = {
    commits: optimizedCommits as Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      repository?: string;
      url: string;
    }>,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.fullName,
      description: singleRepo.description,
    };
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCommitSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.fullName === firstRepo.fullName
  );

  return allSameRepo ? firstRepo : null;
}

export async function searchGitHubCommits(
  params: GitHubCommitSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-commits', params);

  return withCache(cacheKey, async () => {
    try {
      const args = buildGitHubCommitCliArgs(params);
      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';

      if (errorMessage.includes('authentication')) {
        return createResult({
          error: createAuthenticationError(),
        });
      }

      if (errorMessage.includes('rate limit')) {
        return createResult({
          error: createRateLimitError(false),
        });
      }

      return createResult({
        error: createSearchFailedError('commits'),
      });
    }
  });
}

export function buildGitHubCommitCliArgs(
  params: GitHubCommitSearchParams
): string[] {
  const builder = new GitHubCommitsSearchBuilder();
  return builder.build(params);
}
