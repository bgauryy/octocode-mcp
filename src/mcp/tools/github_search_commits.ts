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

export const GITHUB_SEARCH_COMMITS_TOOL_NAME = 'githubSearchCommits';

const DESCRIPTION = `Search GitHub commits by message, author, or date. Returns SHAs for github_fetch_content (branch=SHA). Can fetch commit content changes (diffs/patches) when getChangesContent=true.

SEARCH STRATEGY FOR BEST RESULTS:
- Use minimal search terms for broader coverage (2-3 words max)
- Separate searches for different aspects vs complex queries
- Use filters to narrow scope after getting initial results
- getChangesContent=true only when analyzing actual code changes`;

export function registerGitHubSearchCommitsTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_COMMITS_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Commit message search terms (keep minimal for broader results)'
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
          .describe('GitHub username of commit author'),
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
          .describe('GitHub username of committer'),
        'committer-name': z
          .string()
          .optional()
          .describe('Full name of committer'),
        'committer-email': z.string().optional().describe('Email of committer'),

        // Date filters
        'author-date': z
          .string()
          .optional()
          .describe('Filter by author date (e.g., >2020-01-01)'),
        'committer-date': z
          .string()
          .optional()
          .describe('Filter by commit date (e.g., >2020-01-01)'),

        // Hash filters
        hash: z.string().optional().describe('Commit SHA (full or partial)'),
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
            'Get actual code diffs - only use when analyzing changes, not for commit identification'
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
    async (args: GitHubCommitSearchParams): Promise<CallToolResult> => {
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

          // Step 1: If complex query, simplify search terms
          if (args.query && args.query.trim().split(' ').length > 2) {
            const words = args.query.trim().split(' ');
            const simplified = words.slice(0, 1).join(' '); // Take first word only
            simplificationSteps.push(
              `Try simpler search: "${simplified}" instead of "${args.query}"`
            );
          }

          // Step 2: Remove filters progressively
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

          // Step 3: Alternative approaches
          if (!args.query && hasFilters) {
            simplificationSteps.push(
              'Add basic search terms like "fix", "update", or "add" with your filters'
            );
          }

          // Step 4: Ask for user guidance if no obvious simplification
          if (simplificationSteps.length === 0) {
            simplificationSteps.push(
              "Try different keywords or ask the user to be more specific about what commits they're looking for"
            );
          }

          return createResult({
            error: `${createNoResultsError('commits')}

Try these simplified searches:
${simplificationSteps.map(step => `• ${step}`).join('\n')}

Or ask the user:
• "What specific type of commits are you looking for?" 
• "Can you provide different keywords to search for?"
• "Should I search in a specific repository instead?"

Alternative tools:
• Use github_search_code for file-specific commits
• Use github_search_repos to find repositories first`,
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
      const commitObj: any = {
        sha: item.sha, // Use as branch parameter in github_fetch_content
        message: getCommitTitle(item.commit?.message ?? ''),
        author: item.commit?.author?.name ?? item.author?.login ?? 'Unknown',
        date: toDDMMYYYY(item.commit?.author?.date ?? ''),
        repository: singleRepo
          ? undefined
          : simplifyRepoUrl(item.repository?.url || ''),
        url: singleRepo
          ? item.sha
          : `${simplifyRepoUrl(item.repository?.url || '')}@${item.sha}`,
      };

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
            .map((f: any) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              changes: f.changes,
              patch: f.patch
                ? f.patch.substring(0, 1000) +
                  (f.patch.length > 1000 ? '...' : '')
                : undefined,
            }))
            .slice(0, 5), // Limit to 5 files per commit
        };
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

function buildGitHubCommitCliArgs(params: GitHubCommitSearchParams): string[] {
  const args = ['commits'];

  // Add query if provided - simplified approach for better results
  if (params.query) {
    // Simple, direct query handling - GitHub commit search works better with straightforward queries
    args.push(params.query.trim());
  }

  // Repository filters
  if (params.owner && params.repo) {
    args.push(`--repo=${params.owner}/${params.repo}`);
  } else if (params.owner) {
    args.push(`--owner=${params.owner}`);
  }

  // Author filters
  if (params.author) args.push(`--author=${params.author}`);
  if (params['author-name'])
    args.push(`--author-name=${params['author-name']}`);
  if (params['author-email'])
    args.push(`--author-email=${params['author-email']}`);

  // Committer filters
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params['committer-name'])
    args.push(`--committer-name=${params['committer-name']}`);
  if (params['committer-email'])
    args.push(`--committer-email=${params['committer-email']}`);

  // Date filters
  if (params['author-date'])
    args.push(`--author-date=${params['author-date']}`);
  if (params['committer-date'])
    args.push(`--committer-date=${params['committer-date']}`);

  // Hash filters
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);

  // State filters
  if (params.merge !== undefined) args.push(`--merge`);

  // Visibility
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  // Sorting and pagination
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);
  if (params.limit) args.push(`--limit=${params.limit}`);

  // JSON output
  args.push('--json=sha,commit,author,committer,repository,url,parents');

  return args;
}
