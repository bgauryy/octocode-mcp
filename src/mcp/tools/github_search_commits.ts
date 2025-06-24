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
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_commits';

const DESCRIPTION = `Search commit history effectively with GitHub's commit search. Use simple, specific terms for best results. Complex boolean queries may return limited results - try individual keywords instead.`;

export function registerGitHubSearchCommitsTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Search query with boolean logic. Boolean: "fix AND bug", exact phrases: "initial commit", advanced syntax: "author:john OR committer:jane".'
          ),

        // Repository filters
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/organization. Leave empty for global search.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name. Do exploratory search without repo filter first'
          ),

        // Author filters
        author: z.string().optional().describe('Filter by commit author'),
        authorName: z.string().optional().describe('Filter by author name'),
        authorEmail: z.string().optional().describe('Filter by author email'),

        // Committer filters
        committer: z.string().optional().describe('Filter by committer'),
        committerName: z
          .string()
          .optional()
          .describe('Filter by committer name'),
        committerEmail: z
          .string()
          .optional()
          .describe('Filter by committer email'),

        // Date filters
        authorDate: z
          .string()
          .optional()
          .describe(
            'Filter by authored date (format: >2020-01-01, <2023-12-31)'
          ),
        committerDate: z
          .string()
          .optional()
          .describe(
            'Filter by committed date (format: >2020-01-01, <2023-12-31)'
          ),

        // Hash filters
        hash: z.string().optional().describe('Filter by commit hash'),
        parent: z.string().optional().describe('Filter by parent hash'),
        tree: z.string().optional().describe('Filter by tree hash'),

        // State filters
        merge: z.boolean().optional().describe('Filter merge commits'),

        // Visibility
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter by repository visibility'),

        // Pagination and sorting
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Maximum results (default: 25, max: 50)'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Sort criteria (default: relevance)'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order (default: desc)'),
      },
      annotations: {
        title: 'GitHub Commit Search',
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
        const commits: GitHubCommitSearchItem[] = JSON.parse(execResult.result);

        // GitHub CLI returns a direct array
        const items = Array.isArray(commits) ? commits : [];

        // Enhanced handling for no results - provide fallback suggestions
        if (items.length === 0) {
          return createResult({
            data: {
              commits: [],
              total_count: 0,
              cli_command: execResult.command,
              suggestions: {
                message:
                  'No commits found. GitHub commit search is limited compared to code/issue search.',
                fallback_strategies: [
                  'Try simpler, shorter queries (single keywords work better)',
                  "Use broader terms like 'fix' instead of 'fix useState bug'",
                  'Search by author: add author filter for specific contributors',
                  'Use date ranges: add authorDate or committerDate filters',
                  'Try github_search_code tool for finding code patterns instead',
                ],
                alternative_queries: generateCommitSearchAlternatives(
                  args.query
                ),
              },
            },
          });
        }

        // Transform to optimized format
        const optimizedResult = transformCommitsToOptimizedFormat(items, args);

        return createResult({ data: optimizedResult });
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        if (errorMessage.includes('authentication')) {
          return createResult({
            error: 'GitHub authentication required - run api_status_check tool',
          });
        }

        if (errorMessage.includes('rate limit')) {
          return createResult({
            error: 'GitHub rate limit exceeded - try more specific filters',
          });
        }

        return createResult({
          error: 'Commit search failed',
          suggestions: [
            'Check authentication with api_status_check',
            'Use more specific date ranges or author filters',
            'Try simpler boolean queries',
          ],
        });
      }
    }
  );
}

/**
 * Transform GitHub CLI response to optimized format
 */
function transformCommitsToOptimizedFormat(
  items: GitHubCommitSearchItem[],
  _params: GitHubCommitSearchParams
): OptimizedCommitSearchResult {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  // Get unique authors for metadata
  const uniqueAuthors = new Set(
    items.map(
      item => item.commit?.author?.name || item.author?.login || 'Unknown'
    )
  ).size;

  const optimizedCommits = items
    .map(item => ({
      sha: item.sha,
      message: getCommitTitle(item.commit?.message || ''),
      author: item.commit?.author?.name || item.author?.login || 'Unknown',
      date: toDDMMYYYY(item.commit?.author?.date || ''),
      repository: singleRepo
        ? undefined
        : simplifyRepoUrl(item.repository?.url || ''),
      url: singleRepo
        ? item.sha
        : `${simplifyRepoUrl(item.repository?.url || '')}@${item.sha}`,
    }))
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

  // Add metadata for insights
  if (items.length > 1) {
    result.metadata = {
      timeframe: getTimeframe(items),
      unique_authors: uniqueAuthors,
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

/**
 * Calculate timeframe of commits
 */
function getTimeframe(items: GitHubCommitSearchItem[]): string {
  if (items.length === 0) return '';

  const dates = items.map(item => new Date(item.commit?.author?.date || ''));
  const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
  const newest = new Date(Math.max(...dates.map(d => d.getTime())));

  const diffMs = newest.getTime() - oldest.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'same day';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
  return `${Math.floor(diffDays / 365)} years`;
}

/**
 * Generate alternative commit search queries when original query fails
 */
function generateCommitSearchAlternatives(originalQuery?: string): Array<{
  query: string;
  reason: string;
}> {
  if (!originalQuery) {
    return [
      { query: 'fix', reason: 'Search for general fixes' },
      { query: 'bug', reason: 'Search for bug-related commits' },
      { query: 'refactor', reason: 'Search for refactoring commits' },
    ];
  }

  const alternatives: Array<{ query: string; reason: string }> = [];
  const query = originalQuery.toLowerCase();

  // Extract key terms and create simpler alternatives
  if (query.includes('fix') && query.includes('bug')) {
    alternatives.push(
      { query: 'fix', reason: 'Broader search for all fixes' },
      { query: 'bug', reason: 'Search for bug-related commits' }
    );
  } else if (query.includes(' ')) {
    // Multi-word query - suggest individual terms
    const words = query.split(' ').filter(w => w.length > 2);
    words.slice(0, 2).forEach(word => {
      alternatives.push({
        query: word,
        reason: `Single keyword search for '${word}'`,
      });
    });
  }

  // Always suggest some common commit patterns
  alternatives.push(
    { query: 'feat', reason: 'Search for feature commits' },
    { query: 'docs', reason: 'Search for documentation updates' }
  );

  return alternatives.slice(0, 4); // Limit to 4 suggestions
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
          error: 'GitHub authentication required',
        });
      }

      if (errorMessage.includes('rate limit')) {
        return createResult({
          error: 'GitHub rate limit exceeded',
        });
      }

      return createResult({
        error: 'Commit search execution failed',
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
  if (params.authorName) args.push(`--author-name=${params.authorName}`);
  if (params.authorEmail) args.push(`--author-email=${params.authorEmail}`);

  // Committer filters
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params.committerName)
    args.push(`--committer-name=${params.committerName}`);
  if (params.committerEmail)
    args.push(`--committer-email=${params.committerEmail}`);

  // Date filters
  if (params.authorDate) args.push(`--author-date=${params.authorDate}`);
  if (params.committerDate)
    args.push(`--committer-date=${params.committerDate}`);

  // Hash filters
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);

  // State filters
  if (params.merge !== undefined) args.push(`--merge=${params.merge}`);

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
