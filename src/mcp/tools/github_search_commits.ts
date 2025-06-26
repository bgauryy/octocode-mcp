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

const TOOL_NAME = 'github_search_commits';

const DESCRIPTION = `Smart commit history search across GitHub repositories.

USAGE STRATEGY:
- Start simple: "fix bug" or "refactor"
- Use quotes for exact messages: "initial commit"
- Add filters progressively: author:john created:>2024-01-01

KEY FILTERS:
- author/committer: Find commits by person
- created/merged: Date-based filtering
- repo/owner: Target specific repositories
- hash: Search by commit SHA

SMART DEFAULTS:
- Returns 25 most relevant commits
- Searches commit messages by default
- Optimizes for code history analysis`;

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
            'Search terms. Start simple: "bug fix", "refactor". Use quotes for exact phrases.'
          ),

        // Repository filters
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/org. For private repos, use api_status_check first.'
          ),
        repo: z
          .string()
          .optional()
          .describe('Repository name. Use for targeted searches.'),

        // Author filters
        author: z
          .string()
          .optional()
          .describe('GitHub username of commit author'),
        authorName: z
          .string()
          .optional()
          .describe('Full name of commit author'),
        authorEmail: z.string().optional().describe('Email of commit author'),

        // Committer filters
        committer: z
          .string()
          .optional()
          .describe('GitHub username of committer'),
        committerName: z.string().optional().describe('Full name of committer'),
        committerEmail: z.string().optional().describe('Email of committer'),

        // Date filters
        authorDate: z
          .string()
          .optional()
          .describe(
            'When authored. Format: >2020-01-01, <2023-12-31, 2020-01-01..2023-12-31'
          ),
        committerDate: z
          .string()
          .optional()
          .describe(
            'When committed. Format: >2020-01-01, <2023-12-31, 2020-01-01..2023-12-31'
          ),

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
          .describe('Results limit (1-50). Default: 25'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Sort by date. Default: best match'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order. Default: desc'),
      },
      annotations: {
        title: 'GitHub Commit Search - Smart History Analysis',
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
          return createResult({
            error: createNoResultsError('commits'),
          });
        }

        // Transform to optimized format
        const optimizedResult = transformCommitsToOptimizedFormat(items, args);

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
function transformCommitsToOptimizedFormat(
  items: GitHubCommitSearchItem[],
  _params: GitHubCommitSearchParams
): OptimizedCommitSearchResult {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

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
