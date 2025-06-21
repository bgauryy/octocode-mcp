import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitsSearchParams } from '../../types';
import {
  createResult,
  createSuccessResult,
  createErrorResult,
  needsQuoting,
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
          !args.owner &&
          !args.author &&
          !args.committer &&
          !args.repo
        ) {
          return createResult(
            'Either query or at least one filter is required',
            true
          );
        }

        const result = await searchGitHubCommits(args);
        return result;
      } catch (error) {
        return createResult(
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
      const { command, args } = buildGitHubCommitsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const rawContent = execResult.result;

      // Parse JSON results and provide structured analysis
      let commits = [];
      const analysis = {
        totalFound: 0,
        recentCommits: 0,
        topAuthors: [] as Array<{ name: string; commits: number }>,
        repositories: new Set<string>(),
      };

      // Parse JSON response from GitHub CLI
      commits = JSON.parse(rawContent);

      if (Array.isArray(commits) && commits.length > 0) {
        analysis.totalFound = commits.length;

        // Simple analysis
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );
        const authorCounts = {} as Record<string, number>;

        commits.forEach(commit => {
          // Count recent commits
          const commitDate =
            commit.commit?.author?.date || commit.commit?.committer?.date;
          if (commitDate && new Date(commitDate) > thirtyDaysAgo) {
            analysis.recentCommits++;
          }

          // Count authors
          const authorName =
            commit.commit?.author?.name || commit.author?.login || 'Unknown';
          authorCounts[authorName] = (authorCounts[authorName] || 0) + 1;

          // Track repositories
          if (commit.repository?.fullName) {
            analysis.repositories.add(commit.repository.fullName);
          }
        });

        // Get top authors
        analysis.topAuthors = Object.entries(authorCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([name, count]) => ({ name, commits: count }));

        // Format commits for output
        const formattedCommits = commits.map(commit => ({
          sha: commit.sha,
          message: commit.commit?.message || '',
          author: {
            name: commit.commit?.author?.name,
            email: commit.commit?.author?.email,
            date: commit.commit?.author?.date,
            login: commit.author?.login,
          },
          committer: {
            name: commit.commit?.committer?.name,
            email: commit.commit?.committer?.email,
            date: commit.commit?.committer?.date,
            login: commit.committer?.login,
          },
          repository: commit.repository
            ? {
                name: commit.repository.name,
                fullName: commit.repository.fullName,
                url: commit.repository.url,
                description: commit.repository.description,
              }
            : null,
          url: commit.url,
          parents: commit.parents?.map((p: { sha: string }) => p.sha) || [],
        }));

        return createSuccessResult({
          query: params.query,
          total: analysis.totalFound,
          commits: formattedCommits,
          summary: {
            recentCommits: analysis.recentCommits,
            topAuthors: analysis.topAuthors,
            repositories: Array.from(analysis.repositories),
          },
        });
      }

      return createSuccessResult({
        query: params.query,
        total: 0,
        commits: [],
      });
    } catch (error) {
      return createErrorResult(
        'GitHub commit search failed - verify repository exists or try different filters',
        error
      );
    }
  });
}

function buildGitHubCommitsSearchCommand(params: GitHubCommitsSearchParams): {
  command: GhCommand;
  args: string[];
} {
  // Build query following GitHub CLI patterns
  const query = params.query?.trim() || '';

  // Handle complex queries (with qualifiers, operators, or --) differently
  const hasComplexSyntax =
    query.includes('--') ||
    query.includes(':') ||
    query.includes('OR') ||
    query.includes('AND') ||
    query.includes('(') ||
    query.includes(')') ||
    query.startsWith('-');

  const args = ['commits'];

  // Only add query if it exists
  if (query) {
    if (hasComplexSyntax) {
      // For complex queries with special syntax, handle carefully
      const queryParts = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      queryParts.forEach(part => {
        // If part contains shell special characters, quote it
        if (/[><=&|$`(){}[\];\\]/.test(part) && !part.includes('"')) {
          args.push(`"${part}"`);
        } else {
          args.push(part);
        }
      });
    } else {
      // For simple queries, use quoting logic
      const queryString = needsQuoting(query) ? `"${query}"` : query;
      args.push(queryString);
    }
  }

  // Add JSON output with commit fields
  args.push('--json', 'author,commit,committer,id,parents,repository,sha,url');

  // Add all filters
  if (params.author) args.push(`--author=${params.author}`);
  if (params.authorDate) args.push(`--author-date="${params.authorDate}"`);
  if (params.authorEmail) args.push(`--author-email=${params.authorEmail}`);
  if (params.authorName) args.push(`--author-name="${params.authorName}"`);
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params.committerDate)
    args.push(`--committer-date="${params.committerDate}"`);
  if (params.committerEmail)
    args.push(`--committer-email=${params.committerEmail}`);
  if (params.committerName)
    args.push(`--committer-name="${params.committerName}"`);
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);
  if (params.merge) args.push('--merge');
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  // Handle repo and owner
  if (params.repo && params.owner) {
    args.push(`--repo=${params.owner}/${params.repo}`);
  } else if (params.repo) {
    args.push(`--repo=${params.repo}`);
  } else if (params.owner) {
    args.push(`--owner=${params.owner}`);
  }

  // Sorting
  const sortBy = params.sort || 'best-match';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }
  if (params.order) args.push(`--order=${params.order}`);

  // Limit
  if (params.limit) args.push(`--limit=${params.limit}`);

  return { command: 'search', args };
}
