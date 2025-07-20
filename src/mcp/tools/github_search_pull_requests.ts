import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubPullRequestsSearchParams,
  GitHubPullRequestsSearchResult,
  GitHubPullRequestItem,
} from '../../types';
import { createResult, toDDMMYYYY } from '../responses';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import {
  ERROR_MESSAGES,
  SUGGESTIONS,
  createNoResultsError,
  createSearchFailedError,
} from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';

// TODO: add PR commeents. e.g, gh pr view <PR_NUMBER_OR_URL_OR_BRANCH> --comments

export const GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME = 'githubSearchPullRequests';

const DESCRIPTION = `Search GitHub PRs by keywords, state, or author. Returns head/base SHAs for github_fetch_content (branch=SHA). Can fetch all PR commits with changes using getCommitData=true.

SEARCH STRATEGY FOR BEST RESULTS:
- Use minimal search terms for broader coverage (2-3 words max)
- Separate searches for different aspects vs complex queries  
- Use filters to narrow scope after getting initial results
- Use getCommitData=true to get all commits in PR with file changes
- Use github_search_commits with head_sha/base_sha from results to get code changes

COMMIT DATA FETCHING (getCommitData=true):
- Fetches all commits in the PR using 'gh pr view --json commits'
- For each commit, fetches detailed changes using GitHub API
- Shows commit SHA, message, author, and file changes
- Includes up to 10 commits per PR with detailed diffs
- Each commit shows changed files with additions/deletions/patches
- Example: Shows individual commits like "Fix bug in component" with specific file changes

EXAMPLE OUTPUT WITH getCommitData=true:
{
  "commits": {
    "total_count": 3,
    "commits": [
      {
        "sha": "abc123",
        "message": "Fix bug in component", 
        "author": "username",
        "diff": {
          "changed_files": 2,
          "additions": 15,
          "deletions": 3,
          "files": [...]
        }
      }
    ]
  }
}

NOTE: The head_sha and base_sha fields in the PR results can be used as the 'hash' parameter in github_search_commits to look up the exact commit and get actual code changes.

TOKEN OPTIMIZATION:
- getCommitData=true is expensive in tokens. Use only when necessary.
- Consider using github_search_commits with head_sha/base_sha instead for specific commits`;

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1, 'Search query is required and cannot be empty')
          .describe(
            'Search query for PR content (keep minimal for broader results)'
          ),
        owner: z
          .string()
          .optional()
          .describe('Repository owner (use with repo param)'),
        repo: z
          .string()
          .optional()
          .describe('Repository name (use with owner param)'),
        author: z.string().optional().describe('GitHub username of PR author'),
        assignee: z.string().optional().describe('GitHub username of assignee'),
        mentions: z.string().optional().describe('PRs mentioning this user'),
        commenter: z.string().optional().describe('User who commented on PR'),
        involves: z.string().optional().describe('User involved in any way'),
        'reviewed-by': z
          .string()
          .optional()
          .describe('User who reviewed the PR'),
        'review-requested': z
          .string()
          .optional()
          .describe('User/team requested for review'),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Filter by state: open or closed'),
        head: z.string().optional().describe('Filter on head branch name'),
        base: z.string().optional().describe('Filter on base branch name'),
        language: z.string().optional().describe('Repository language'),
        created: z
          .string()
          .optional()
          .describe('Filter by created date (e.g., >2020-01-01)'),
        updated: z
          .string()
          .optional()
          .describe('Filter by updated date (e.g., >2020-01-01)'),
        'merged-at': z
          .string()
          .optional()
          .describe('Filter by merged date (e.g., >2020-01-01)'),
        closed: z
          .string()
          .optional()
          .describe('Filter by closed date (e.g., >2020-01-01)'),
        draft: z.boolean().optional().describe('Filter by draft state'),
        checks: z
          .enum(['pending', 'success', 'failure'])
          .optional()
          .describe('Filter by checks status'),
        merged: z.boolean().optional().describe('Filter by merged state'),
        review: z
          .enum(['none', 'required', 'approved', 'changes_requested'])
          .optional()
          .describe('Filter by review status'),
        app: z.string().optional().describe('Filter by GitHub App author'),
        archived: z
          .boolean()
          .optional()
          .describe('Filter by repository archived state'),
        comments: z
          .boolean()
          .default(false)
          .describe(
            'Include comment content in search results. This is a very expensive operation in tokens and should be used with caution.'
          ),
        interactions: z
          .number()
          .optional()
          .describe('Total interactions (reactions + comments)'),
        'team-mentions': z
          .string()
          .optional()
          .describe('Filter by team mentions'),
        reactions: z
          .number()
          .optional()
          .describe('Filter by number of reactions'),
        locked: z
          .boolean()
          .optional()
          .describe('Filter by locked conversation status'),
        'no-assignee': z
          .boolean()
          .optional()
          .describe('Filter by missing assignee'),
        'no-label': z.boolean().optional().describe('Filter by missing label'),
        'no-milestone': z
          .boolean()
          .optional()
          .describe('Filter by missing milestone'),
        'no-project': z
          .boolean()
          .optional()
          .describe('Filter by missing project'),
        label: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Filter by label'),
        milestone: z.string().optional().describe('Milestone title'),
        project: z.string().optional().describe('Project board owner/number'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility'),
        match: z
          .array(z.enum(['title', 'body', 'comments']))
          .optional()
          .describe('Restrict search to specific fields'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Maximum number of results to fetch'),
        sort: z
          .enum([
            'comments',
            'reactions',
            'reactions-+1',
            'reactions--1',
            'reactions-smile',
            'reactions-thinking_face',
            'reactions-heart',
            'reactions-tada',
            'interactions',
            'created',
            'updated',
          ])
          .optional()
          .describe('Sort fetched results'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order of results (requires --sort)'),
        getCommitData: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Set to true to fetch all commits in the PR with their changes. Shows commit messages, authors, and file changes. WARNING: EXTREMELY expensive in tokens - fetches diff/patch content for each commit.'
          ),
      },
      annotations: {
        title: 'GitHub PR Search - Smart & Effective',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubPullRequestsSearchParams): Promise<CallToolResult> => {
        if (!args.query?.trim()) {
          return createResult({
            error: `${ERROR_MESSAGES.QUERY_REQUIRED} ${SUGGESTIONS.PROVIDE_PR_KEYWORDS}`,
          });
        }

        if (args.query.length > 256) {
          return createResult({
            error: ERROR_MESSAGES.QUERY_TOO_LONG,
          });
        }

        try {
          return await searchGitHubPullRequests(args);
        } catch (error) {
          return createResult({
            error: createSearchFailedError('pull_requests'),
          });
        }
      }
    )
  );
}

async function searchGitHubPullRequests(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-prs', params);

  return withCache(cacheKey, async () => {
    const { command, args } = buildGitHubPullRequestsAPICommand(params);
    const result = await executeGitHubCommand(command, args, { cache: false });

    if (result.isError) {
      const errorMsg = result.content[0].text as string;

      // Enhanced error handling for repository-specific searches
      if (params.owner && params.repo) {
        // Handle 404 errors with repository and branch checking
        if (errorMsg.includes('404')) {
          // Single repository check to avoid duplicate API calls
          const repoCheckResult = await executeGitHubCommand(
            'api',
            [`/repos/${params.owner}/${params.repo}`],
            { cache: false }
          );

          if (repoCheckResult.isError) {
            // Repository doesn't exist
            return createResult({
              error: `Repository "${params.owner}/${params.repo}" not found. Use github_search_repositories to find the correct repository name.`,
            });
          }

          // Repository exists, check if it's a branch-related error
          if (params.head || params.base) {
            try {
              const repoData = JSON.parse(
                repoCheckResult.content[0].text as string
              );
              const defaultBranch = repoData.result?.default_branch || 'main';

              let branchSuggestion = '';
              if (params.head && params.head !== defaultBranch) {
                branchSuggestion = `\n\nNote: Branch "${params.head}" may not exist. Repository default branch is "${defaultBranch}".`;
                branchSuggestion += `\nTry searching without head branch filter or use head="${defaultBranch}".`;
              }
              if (params.base && params.base !== defaultBranch) {
                branchSuggestion += `\n\nNote: Branch "${params.base}" may not exist. Repository default branch is "${defaultBranch}".`;
                branchSuggestion += `\nTry searching without base branch filter or use base="${defaultBranch}".`;
              }

              if (branchSuggestion) {
                return createResult({
                  error:
                    createNoResultsError('pull_requests') + branchSuggestion,
                });
              }
            } catch (e) {
              // Continue with original error if parsing fails
            }
          }
        }

        // Handle rate limit errors
        if (
          errorMsg.includes('rate limit') ||
          errorMsg.includes('API rate limit')
        ) {
          return createResult({
            error: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          });
        }
      }

      return result;
    }

    const execResult = JSON.parse(result.content[0].text as string);

    // Handle both search API and gh pr list formats
    const isListFormat = Array.isArray(execResult.result);
    const pullRequests = isListFormat
      ? execResult.result
      : execResult.result?.items || [];

    if (pullRequests.length === 0) {
      // Progressive simplification strategy based on current search complexity
      const simplificationSteps: string[] = [];
      let hasFilters = false;

      // Check for active filters
      const activeFilters = [];
      if (params.owner && params.repo) activeFilters.push('repo');
      if (params.author) activeFilters.push('author');
      if (params.state) activeFilters.push('state');
      if (params.label) activeFilters.push('label');
      if (params.head) activeFilters.push('head-branch');
      if (params.base) activeFilters.push('base-branch');
      if (params.assignee) activeFilters.push('assignee');
      if (params.created) activeFilters.push('date');

      hasFilters = activeFilters.length > 0;

      // Step 1: If complex query, simplify search terms
      if (params.query && params.query.trim().split(' ').length > 2) {
        const words = params.query.trim().split(' ');
        const simplified = words.slice(0, 1).join(' '); // Take first word only
        simplificationSteps.push(
          `Try simpler search: "${simplified}" instead of "${params.query}"`
        );
      }

      // Step 2: Remove filters progressively
      if (hasFilters) {
        if (activeFilters.length > 2) {
          simplificationSteps.push(
            `Remove some filters (currently: ${activeFilters.join(', ')}) and keep only the most important ones`
          );
        } else if (activeFilters.length > 1) {
          simplificationSteps.push(
            `Remove one filter (currently: ${activeFilters.join(', ')}) to broaden search`
          );
        } else {
          simplificationSteps.push(
            `Remove the ${activeFilters[0]} filter and search more broadly`
          );
        }
      }

      // Step 3: Alternative approaches
      if (!params.query && hasFilters) {
        simplificationSteps.push(
          'Add basic search terms like "fix", "feature", "bug", or "update" with your filters'
        );
      }

      // Step 4: Repository-specific guidance
      if (!params.owner && !params.repo) {
        simplificationSteps.push(
          'Try searching in a specific repository first using owner and repo parameters'
        );
      }

      // Step 5: Ask for user guidance if no obvious simplification
      if (simplificationSteps.length === 0) {
        simplificationSteps.push(
          "Try different keywords or ask the user to be more specific about what PRs they're looking for"
        );
      }

      return createResult({
        error: `${createNoResultsError('pull_requests')}

Try these simplified searches:
${simplificationSteps.map(step => `• ${step}`).join('\n')}

Or ask the user:
• "What specific type of pull requests are you looking for?"
• "Can you provide different keywords to search for?"
• "Should I search in a specific repository instead?"
• "Are you looking for open or closed PRs?"

Alternative tools:
• Use github_search_code for PR-related file changes
• Use github_search_repos to find repositories first`,
      });
    }

    const cleanPRs: GitHubPullRequestItem[] = await Promise.all(
      pullRequests.map(async (pr: any) => {
        // Handle gh pr list format
        if (isListFormat) {
          const result: GitHubPullRequestItem = {
            number: pr.number,
            title: pr.title,
            state: pr.state?.toLowerCase() || 'unknown',
            author: pr.author?.login || '',
            repository: `${params.owner}/${params.repo}`,
            labels: pr.labels?.map((l: any) => l.name) || [],
            created_at: toDDMMYYYY(pr.createdAt),
            updated_at: toDDMMYYYY(pr.updatedAt),
            url: pr.url,
            comments: pr.comments || 0,
            reactions: 0, // Not available in list format
            draft: pr.isDraft || false,
          };

          // Add commit SHAs for use with github_fetch_content
          // Use head_sha/base_sha as branch parameter to view PR files
          if (pr.headRefName) result.head = pr.headRefName;
          if (pr.headRefOid) result.head_sha = pr.headRefOid; // Use as branch=SHA
          if (pr.baseRefName) result.base = pr.baseRefName;
          if (pr.baseRefOid) result.base_sha = pr.baseRefOid; // Use as branch=SHA

          // Fetch commit data if requested
          if (params.getCommitData && params.owner && params.repo) {
            const commitData = await fetchPRCommitData(
              params.owner,
              params.repo,
              pr.number
            );
            if (commitData) {
              result.commits = commitData;
            }
          }

          return result;
        }

        // Handle search API format
        const result: GitHubPullRequestItem = {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login || '',
          repository:
            pr.repository_url?.split('/').slice(-2).join('/') || 'unknown',
          labels: pr.labels?.map((l: any) => l.name) || [],
          created_at: toDDMMYYYY(pr.created_at),
          updated_at: toDDMMYYYY(pr.updated_at),
          url: pr.html_url,
          comments: pr.comments,
          reactions: pr.reactions?.total_count || 0,
          draft: pr.draft,
        };

        // Only include optional fields if they have values
        if (pr.merged_at) result.merged_at = pr.merged_at;
        if (pr.closed_at) result.closed_at = toDDMMYYYY(pr.closed_at);
        if (pr.head?.ref) result.head = pr.head.ref;
        if (pr.base?.ref) result.base = pr.base.ref;

        // Fetch commit data if requested
        if (params.getCommitData && params.owner && params.repo) {
          const commitData = await fetchPRCommitData(
            params.owner,
            params.repo,
            pr.number
          );
          if (commitData) {
            result.commits = commitData;
          }
        }

        return result;
      })
    );

    const searchResult: GitHubPullRequestsSearchResult = {
      results: cleanPRs,
      total_count: isListFormat
        ? cleanPRs.length
        : execResult.result?.total_count || cleanPRs.length,
    };

    // Add helpful context if filtering by branches that might not exist
    let additionalContext = '';
    if (
      cleanPRs.length === 0 &&
      params.owner &&
      params.repo &&
      (params.head || params.base)
    ) {
      additionalContext =
        '\n\nNote: No PRs found with specified branch filters. Consider removing head/base filters or checking if branches exist.';
    }

    return createResult({
      data: searchResult,
      ...(additionalContext && { message: additionalContext }),
    });
  });
}

export function buildGitHubPullRequestsAPICommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  // For repository-specific searches, use gh pr list instead of search API
  // This provides commit SHAs (head_sha, base_sha) which are essential for
  // integrating with github_fetch_content to view PR code at specific commits
  if (params.owner && params.repo) {
    return buildGitHubPullRequestsListCommand(params);
  }

  // For general searches without owner/repo, use GitHub API search
  // This searches across all repositories accessible to the user
  const queryParts = [`${params.query}`, 'type:pr'];

  // Add filters to the query string
  if (params.state) queryParts.push(`state:${params.state}`);
  if (params.author) queryParts.push(`author:${params.author}`);
  if (params.assignee) queryParts.push(`assignee:${params.assignee}`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => queryParts.push(`label:"${label}"`));
  }

  const query = queryParts.join(' ');
  const encodedQuery = encodeURIComponent(query);
  const perPage = Math.min(params.limit || 30, 100);

  return {
    command: 'api',
    args: [`search/issues?q=${encodedQuery}&per_page=${perPage}`],
  };
}

export function buildGitHubPullRequestsListCommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  const args: string[] = [
    'list',
    '--repo',
    `${params.owner}/${params.repo}`,
    '--json',
    'number,title,headRefName,headRefOid,baseRefName,baseRefOid,state,author,labels,createdAt,updatedAt,url,comments,isDraft',
    '--limit',
    String(Math.min(params.limit || 30, 100)),
  ];

  // Add filters
  if (params.state) {
    args.push('--state', params.state);
  }
  if (params.author) {
    args.push('--author', params.author);
  }
  if (params.assignee) {
    args.push('--assignee', params.assignee);
  }
  if (params.head) {
    args.push('--head', params.head);
  }
  if (params.base) {
    args.push('--base', params.base);
  }
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      args.push('--label', label);
    });
  }

  return { command: 'pr', args };
}

async function fetchPRCommitData(
  owner: string,
  repo: string,
  prNumber: number
) {
  try {
    // First, get the list of commits in the PR
    const commitsResult = await executeGitHubCommand(
      'pr',
      [
        'view',
        prNumber.toString(),
        '--json',
        'commits',
        '--repo',
        `${owner}/${repo}`,
      ],
      { cache: false }
    );

    if (commitsResult.isError) {
      return null;
    }

    const commitsData = JSON.parse(commitsResult.content[0].text as string);
    const commits = commitsData.result?.commits || [];

    if (commits.length === 0) {
      return null;
    }

    // Fetch detailed commit data for each commit (limit to first 10 to avoid rate limits)
    const commitDetails = await Promise.all(
      commits.slice(0, 10).map(async (commit: any) => {
        try {
          const commitResult = await executeGitHubCommand(
            'api',
            [`repos/${owner}/${repo}/commits/${commit.oid}`],
            { cache: false }
          );

          if (!commitResult.isError) {
            const commitData = JSON.parse(
              commitResult.content[0].text as string
            );
            const result = commitData.result;

            return {
              sha: commit.oid,
              message: commit.messageHeadline,
              author:
                commit.authors?.[0]?.login ||
                commit.authors?.[0]?.name ||
                'Unknown',
              url: `https://github.com/${owner}/${repo}/commit/${commit.oid}`,
              authoredDate: commit.authoredDate,
              diff: result.files
                ? {
                    changed_files: result.files.length,
                    additions: result.stats?.additions || 0,
                    deletions: result.stats?.deletions || 0,
                    total_changes: result.stats?.total || 0,
                    files: result.files.slice(0, 5).map((f: any) => ({
                      filename: f.filename,
                      status: f.status,
                      additions: f.additions,
                      deletions: f.deletions,
                      changes: f.changes,
                      patch: f.patch
                        ? f.patch.substring(0, 1000) +
                          (f.patch.length > 1000 ? '...' : '')
                        : undefined,
                    })),
                  }
                : undefined,
            };
          }
        } catch (e) {
          // If we can't fetch commit details, return basic info
          return {
            sha: commit.oid,
            message: commit.messageHeadline,
            author:
              commit.authors?.[0]?.login ||
              commit.authors?.[0]?.name ||
              'Unknown',
            url: `https://github.com/${owner}/${repo}/commit/${commit.oid}`,
            authoredDate: commit.authoredDate,
          };
        }
      })
    );

    return {
      total_count: commits.length,
      commits: commitDetails.filter(Boolean),
    };
  } catch (error) {
    return null;
  }
}
