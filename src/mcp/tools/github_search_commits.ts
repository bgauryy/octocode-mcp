import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCommitsSearchParams,
  GhSearchedCommitItem,
  ProcessedCommitItem,
  GitHubCommitsSearchResult,
} from '../../types';
import {
  createSuccessResult,
  createErrorResult,
  formatDateToYYYYMMDD,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_commits';

const DESCRIPTION = `Search commit history with powerful boolean logic and exact phrase matching. Track code evolution, bug fixes, and development workflows with surgical precision.`;

export function registerSearchGitHubCommitsTool(server: McpServer) {
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

        // Basic filters
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/organization from api_status_check results. Essential for searching commits in your accessible repositories.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name. Do exploratory search without repo filter first'
          ),

        // Author filters
        author: z.string().optional().describe('Filter by commit author'),
        authorDate: z
          .string()
          .optional()
          .describe(
            'Filter by authored date (format: >2020-01-01, <2023-12-31)'
          ),
        authorEmail: z.string().optional().describe('Filter by author email'),
        authorName: z.string().optional().describe('Filter by author name'),

        // Committer filters
        committer: z.string().optional().describe('Filter by committer'),
        committerDate: z
          .string()
          .optional()
          .describe(
            'Filter by committed date (format: >2020-01-01, <2023-12-31)'
          ),
        committerEmail: z
          .string()
          .optional()
          .describe('Filter by committer email'),
        committerName: z
          .string()
          .optional()
          .describe('Filter by committer name'),

        // Hash filters
        hash: z.string().optional().describe('Filter by commit hash'),
        parent: z.string().optional().describe('Filter by parent hash'),
        tree: z.string().optional().describe('Filter by tree hash'),

        // Boolean filters
        merge: z.boolean().optional().describe('Filter merge commits'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter by repository visibility'),

        // Sorting and limits
        sort: z
          .enum(['author-date', 'committer-date', 'best-match'])
          .optional()
          .default('best-match')
          .describe('Sort criteria (default: best-match)'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order (default: desc)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Maximum results (default: 25, max: 50)'),
      },
      annotations: {
        title: 'GitHub Commits Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubCommitsSearchParams): Promise<CallToolResult> => {
      try {
        // Query is optional - can search with just filters
        if (
          !args.query?.trim() &&
          !args.author &&
          !args.committer &&
          !args.repo
        ) {
          return createErrorResult(
            'Either query or at least one specific filter (author, committer, repo) is required for focused commit search.',
            true
          );
        }

        const result = await searchGitHubCommits(args);
        return result;
      } catch (error) {
        return createErrorResult(
          'Commit search failed - check query syntax, filters, or repository access',
          true
        );
      }
    }
  );
}

export async function searchGitHubCommits(
  params: GitHubCommitsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-commits', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args, composedQuery } =
        buildGitHubCommitsSearchCommand(params);
      const cliResult = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (cliResult.isError) {
        return cliResult;
      }

      const execResult = JSON.parse(cliResult.content[0].text as string);
      const rawCommits = JSON.parse(
        execResult.result
      ) as GhSearchedCommitItem[];

      if (!Array.isArray(rawCommits)) {
        return createErrorResult(
          'GitHub CLI returned non-array data for commits search.',
          true
        );
      }

      const processedCommits: ProcessedCommitItem[] = rawCommits.map(commit => {
        const firstLineMessage = (commit.commit?.message || '')
          .split('\n')[0]
          .substring(0, 120);
        return {
          sha: commit.sha.substring(0, 7),
          message_first_line: firstLineMessage,
          author_name: commit.commit?.author?.name || commit.author?.login,
          author_email: commit.commit?.author?.email,
          authored_date:
            formatDateToYYYYMMDD(commit.commit?.author?.date) || undefined,
          committer_name:
            commit.commit?.committer?.name || commit.committer?.login,
          committer_email: commit.commit?.committer?.email,
          committed_date:
            formatDateToYYYYMMDD(commit.commit?.committer?.date) || undefined,
          repository_full_name: commit.repository?.full_name,
          html_url: commit.url,
          parent_shas: commit.parents
            ?.map(p => p.sha?.substring(0, 7))
            .filter(Boolean) as string[] | undefined,
        };
      });

      const authorCounts: Record<string, number> = {};
      const repositoriesSearched = new Set<string>();

      processedCommits.forEach(commit => {
        if (commit.author_name) {
          authorCounts[commit.author_name] =
            (authorCounts[commit.author_name] || 0) + 1;
        }
        if (commit.repository_full_name) {
          repositoriesSearched.add(commit.repository_full_name);
        }
      });

      const topAuthors = Object.entries(authorCounts)
        .sort(([, aCount], [, bCount]) => bCount - aCount)
        .slice(0, 5)
        .map(([name, count]) => ({ name: name, commit_count: count }));

      const result: GitHubCommitsSearchResult = {
        query_used: composedQuery || params.query,
        total_returned: rawCommits.length,
        commits: processedCommits,
        summary: {
          ...(topAuthors.length > 0 && { top_authors: topAuthors }),
          ...(repositoriesSearched.size > 0 && {
            repositories_searched: Array.from(repositoriesSearched),
          }),
        },
      };

      if (result.commits.length === 0 && params.query) {
        return createSuccessResult({
          ...result,
          summary: {
            ...result.summary,
            note: `No commits found matching query: ${params.query}`,
          },
        });
      }

      return createSuccessResult(result);
    } catch (error) {
      return createErrorResult(
        'GitHub commit search failed internally - verify query or filters.',
        true
      );
    }
  });
}

function buildGitHubCommitsSearchCommand(params: GitHubCommitsSearchParams): {
  command: GhCommand;
  args: string[];
  composedQuery?: string;
} {
  const command: GhCommand = 'search';
  const args: string[] = ['commits'];

  // Add the main query if provided
  if (params.query?.trim()) {
    args.push(params.query.trim());
  }

  // Use CLI flags for all supported parameters
  if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(o => args.push(`--owner=${o}`));
  }
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    repos.forEach(r => args.push(`--repo=${r}`));
  }

  // Author filters
  if (params.author) args.push(`--author=${params.author}`);
  if (params.authorName) args.push(`--author-name=${params.authorName}`);
  if (params.authorEmail) args.push(`--author-email=${params.authorEmail}`);
  if (params.authorDate) args.push(`--author-date=${params.authorDate}`);

  // Committer filters
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params.committerName) {
    args.push(`--committer-name=${params.committerName}`);
  }
  if (params.committerEmail) {
    args.push(`--committer-email=${params.committerEmail}`);
  }
  if (params.committerDate) {
    args.push(`--committer-date=${params.committerDate}`);
  }

  // Hash filters
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);

  // Boolean filters
  if (params.merge) args.push('--merge');
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  // Sorting and limits
  if (params.sort && params.sort !== 'best-match') {
    args.push(`--sort=${params.sort}`);
  }
  if (params.order) args.push(`--order=${params.order}`);
  if (params.limit) args.push(`--limit=${params.limit}`);

  // Request JSON fields
  const jsonFields = [
    'sha',
    'id',
    'url',
    'commit',
    'author',
    'committer',
    'parents',
    'repository',
  ];
  args.push(`--json=${jsonFields.join(',')}`);

  return { command, args, composedQuery: params.query };
}
