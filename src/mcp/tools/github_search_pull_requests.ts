import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubPullRequestsSearchParams,
  GhRawPullRequestItem,
  ProcessedPullRequestItem,
  GitHubPullRequestsQueryResult,
} from '../../types';
import {
  createSuccessResult,
  createErrorResult,
  formatDateToYYYYMMDD,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';

// TODO: add PR commeents. e.g, gh pr view <PR_NUMBER_OR_URL_OR_BRANCH> --comments

const TOOL_NAME = 'github_search_pull_requests';

const DESCRIPTION = `Find pull requests on GitHub using query strings and filters. Discover feature implementations, code review patterns, and development workflows. Uses 'gh search prs'.`;

const MAX_BODY_SNIPPET_LENGTH = 200;

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1, 'Search query is required.')
          .describe(
            'Search query using GitHub syntax. E.g., "refactor user auth", "label:bug state:open author:app/bot".'
          ),
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter by repository owner(s) (user or organization). E.g., "myorg" or ["myorg", "anotheruser"]. Combines with repo filter if both provided.'
          ),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter by repository name(s). E.g., "myrepo" or ["myrepo", "anotherrepo"]. If owner is also given, forms owner/repo pairs.'
          ),

        // User involvement filters
        author: z
          .string()
          .optional()
          .describe('Filter by PR author (username).'),
        assignee: z
          .string()
          .optional()
          .describe('Filter by assignee (username).'),
        mentions: z
          .string()
          .optional()
          .describe('Filter by user mentions (username).'),
        commenter: z
          .string()
          .optional()
          .describe('Filter by users who have commented (username).'),
        involves: z
          .string()
          .optional()
          .describe('Filter by user involvement (username).'),
        reviewedBy: z
          .string()
          .optional()
          .describe('Filter by a user who has reviewed the PR (username).'),
        reviewRequested: z
          .string()
          .optional()
          .describe(
            'Filter by a user or team whose review is requested (username or org/team-slug).'
          ),
        teamMentions: z
          .string()
          .optional()
          .describe('Filter by team mentions (org/team-slug).'),

        // State and attribute filters
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Filter by PR state.'),
        base: z.string().optional().describe('Filter by base branch name.'),
        head: z.string().optional().describe('Filter by head branch name.'),
        draft: z
          .boolean()
          .optional()
          .describe('Filter by draft state (true or false).'),
        merged: z
          .boolean()
          .optional()
          .describe(
            'Filter by merged state (true for merged, false for unmerged).'
          ),
        locked: z
          .boolean()
          .optional()
          .describe('Filter by locked status (true or false).'),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Filter based on repository archived state (true to include, false to exclude).'
          ),
        label: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter by label(s). E.g., "bug" or ["bug", "enhancement"].'
          ),
        language: z
          .string()
          .optional()
          .describe('Filter by programming language.'),
        milestone: z
          .string()
          .optional()
          .describe('Filter by milestone title (quote if it contains spaces).'),
        project: z
          .string()
          .optional()
          .describe(
            'Filter by project board (owner/number, e.g., "myorg/123").'
          ),

        // Date filters (strings to allow ranges like '>YYYY-MM-DD')
        created: z.string().optional().describe('Filter by creation date.'),
        updated: z.string().optional().describe('Filter by last update date.'),
        mergedAt: z.string().optional().describe('Filter by merge date.'),
        closed: z.string().optional().describe('Filter by closed date.'),

        // Numeric range filters (strings like '>10')
        comments: z
          .string()
          .optional()
          .describe('Filter by number of comments.'),
        reactions: z
          .string()
          .optional()
          .describe('Filter by number of reactions.'),
        interactions: z
          .string()
          .optional()
          .describe('Filter by number of interactions (comments + reactions).'),

        // Status and review filters
        checks: z
          .enum(['pending', 'success', 'failure'])
          .optional()
          .describe('Filter by status of checks.'),
        review: z
          .enum(['none', 'required', 'approved', 'changes_requested'])
          .optional()
          .describe('Filter by review status.'),

        // Match and visibility
        match: z
          .union([
            z.enum(['title', 'body', 'comments']),
            z.array(z.enum(['title', 'body', 'comments'])),
          ])
          .optional()
          .describe(
            'Restrict search to specific fields: title, body, or comments.'
          ),
        visibility: z
          .union([
            z.enum(['public', 'private', 'internal']),
            z.array(z.enum(['public', 'private', 'internal'])),
          ])
          .optional()
          .describe('Filter by repository visibility.'),

        // "No" filters
        noAssignee: z
          .boolean()
          .optional()
          .describe('Filter for PRs with no assignee.'),
        noLabel: z
          .boolean()
          .optional()
          .describe('Filter for PRs with no labels.'),
        noMilestone: z
          .boolean()
          .optional()
          .describe('Filter for PRs with no milestone.'),
        noProject: z
          .boolean()
          .optional()
          .describe('Filter for PRs with no project link.'),
        app: z.string().optional().describe('Filter by GitHub App author.'),

        // Control flags
        limit: z
          .number()
          .int()
          .min(1)
          .max(100) // gh CLI default is 30, max seems to be 1000 via API, but let's cap for LLM use.
          .optional()
          .default(30)
          .describe('Maximum results (default: 30, max: 100).'),
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
            // 'best-match' is default for gh search prs, explicitly setting it can be redundant or error.
          ])
          .optional()
          .describe('Sort criteria (default: best-match by relevance).'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order of results (default: desc).'),
      },
      annotations: {
        title: 'GitHub Pull Request Search (via gh CLI)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubPullRequestsSearchParams): Promise<CallToolResult> => {
      // Basic query validation (though Zod handles .min(1) for query itself)
      if (args.query && args.query.length > 512) {
        // Increased limit slightly from previous 256 for more complex queries
        return createErrorResult(
          'Search query is too long. Please limit to 512 characters.'
        );
      }

      try {
        return await searchGitHubPullRequestsWithGhCli(args);
      } catch (error) {
        return createErrorResult(
          'GitHub pull requests search failed.',
          error as Error
        );
      }
    }
  );
}

async function searchGitHubPullRequestsWithGhCli(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-search-prs', params);

  return withCache(cacheKey, async () => {
    const { command, cliArgs, composedQuery } =
      buildGitHubPrsSearchCLICommand(params);

    const execResult = await executeGitHubCommand(command, cliArgs, {
      cache: false,
    });

    if (execResult.isError) {
      return execResult;
    }

    // Parse the CLI response correctly
    let rawItems: GhRawPullRequestItem[];
    try {
      const execResultData = JSON.parse(execResult.content[0].text as string);
      rawItems = JSON.parse(execResultData.result);
    } catch (parseError) {
      return createErrorResult(
        `Invalid JSON response from 'gh search prs'. Query: ${composedQuery}`,
        parseError as Error
      );
    }

    if (!Array.isArray(rawItems)) {
      return createErrorResult(
        `'gh search prs' returned non-array data. Query: ${composedQuery}`
      );
    }

    const processedPRs: ProcessedPullRequestItem[] = rawItems.map(
      (rawPr: GhRawPullRequestItem): ProcessedPullRequestItem => {
        let bodySnippet = rawPr.body || '';
        if (bodySnippet.length > MAX_BODY_SNIPPET_LENGTH) {
          bodySnippet =
            bodySnippet.substring(0, MAX_BODY_SNIPPET_LENGTH) + '...';
        }

        return {
          pr_number: rawPr.number,
          title: rawPr.title,
          state: rawPr.state,
          author_login: rawPr.author?.login || null,
          repository_full_name: rawPr.repository?.fullName || null,
          labels_names: rawPr.labels?.map(l => l.name) || null,
          created_date: formatDateToYYYYMMDD(rawPr.createdAt),
          updated_date: formatDateToYYYYMMDD(rawPr.updatedAt),
          closed_date: formatDateToYYYYMMDD(rawPr.closedAt),
          html_url: rawPr.url,
          is_draft: rawPr.isDraft,
          is_locked: rawPr.isLocked,
          comments_count: rawPr.commentsCount,
          assignees_logins: rawPr.assignees
            ?.map(a => a.login)
            .filter(Boolean) as string[] | null,
          body_snippet: bodySnippet || null,
        };
      }
    );

    const resultData: GitHubPullRequestsQueryResult = {
      query_used: composedQuery,
      total_returned: processedPRs.length,
      pull_requests: processedPRs,
    };

    return createSuccessResult(resultData);
  });
}

function buildGitHubPrsSearchCLICommand(
  params: GitHubPullRequestsSearchParams
): {
  command: GhCommand;
  cliArgs: string[];
  composedQuery: string;
} {
  const command: GhCommand = 'search';
  const cliArgs: string[] = ['prs'];

  // Build minimal query, prefer CLI flags
  let queryString = params.query?.trim() || '';

  // Only use query syntax for repo filtering when needed
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const owners = Array.isArray(params.owner)
      ? params.owner
      : params.owner
        ? [params.owner]
        : [];
    repos.forEach((repoName, index) => {
      const ownerName =
        owners[index] || (owners.length > 0 ? owners[owners.length - 1] : null);
      if (ownerName) {
        queryString += ` repo:${ownerName}/${repoName}`;
      } else {
        queryString += ` repo:${repoName}`;
      }
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(ownerName => {
      queryString += ` owner:${ownerName}`;
    });
  }

  // Add the query
  if (queryString.trim()) {
    cliArgs.push(queryString.trim());
  }

  // Use CLI flags for all supported parameters
  if (params.author) cliArgs.push(`--author=${params.author}`);
  if (params.assignee) cliArgs.push(`--assignee=${params.assignee}`);
  if (params.mentions) cliArgs.push(`--mentions=${params.mentions}`);
  if (params.commenter) cliArgs.push(`--commenter=${params.commenter}`);
  if (params.involves) cliArgs.push(`--involves=${params.involves}`);
  if (params.reviewedBy) cliArgs.push(`--reviewed-by=${params.reviewedBy}`);
  if (params.reviewRequested) {
    cliArgs.push(`--review-requested=${params.reviewRequested}`);
  }
  if (params.teamMentions)
    cliArgs.push(`--team-mentions=${params.teamMentions}`);
  if (params.state) cliArgs.push(`--state=${params.state}`);
  if (params.base) cliArgs.push(`--base=${params.base}`);
  if (params.head) cliArgs.push(`--head=${params.head}`);
  if (params.language) cliArgs.push(`--language=${params.language}`);
  if (params.milestone) cliArgs.push(`--milestone=${params.milestone}`);
  if (params.project) cliArgs.push(`--project=${params.project}`);
  if (params.app) cliArgs.push(`--app=${params.app}`);

  // Date filters
  if (params.created) cliArgs.push(`--created=${params.created}`);
  if (params.updated) cliArgs.push(`--updated=${params.updated}`);
  if (params.mergedAt) cliArgs.push(`--merged-at=${params.mergedAt}`);
  if (params.closed) cliArgs.push(`--closed=${params.closed}`);

  // Numeric range filters
  if (params.comments) cliArgs.push(`--comments=${params.comments}`);
  if (params.reactions) cliArgs.push(`--reactions=${params.reactions}`);
  if (params.interactions)
    cliArgs.push(`--interactions=${params.interactions}`);

  // Boolean flags
  if (params.draft === true) cliArgs.push('--draft');
  if (params.merged === true) cliArgs.push('--merged');
  if (params.locked === true) cliArgs.push('--locked');
  if (typeof params.archived === 'boolean') {
    cliArgs.push(`--archived=${params.archived}`);
  }
  if (params.noAssignee) cliArgs.push('--no-assignee');
  if (params.noLabel) cliArgs.push('--no-label');
  if (params.noMilestone) cliArgs.push('--no-milestone');
  if (params.noProject) cliArgs.push('--no-project');

  // Array filters
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(l => cliArgs.push(`--label=${l}`));
  }
  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(m => cliArgs.push(`--match=${m}`));
  }
  if (params.visibility) {
    const visibilities = Array.isArray(params.visibility)
      ? params.visibility
      : [params.visibility];
    visibilities.forEach(v => cliArgs.push(`--visibility=${v}`));
  }

  // Status and review filters
  if (params.checks) cliArgs.push(`--checks=${params.checks}`);
  if (params.review) cliArgs.push(`--review=${params.review}`);

  // Sorting and limits
  if (params.sort) cliArgs.push(`--sort=${params.sort}`);
  if (params.order) cliArgs.push(`--order=${params.order}`);
  cliArgs.push(`--limit=${params.limit || 30}`);

  // Request JSON fields
  const jsonFields = [
    'id',
    'number',
    'title',
    'state',
    'url',
    'isDraft',
    'isLocked',
    'createdAt',
    'updatedAt',
    'closedAt',
    'body',
    'commentsCount',
    'author',
    'repository',
    'labels',
    'assignees',
    'authorAssociation',
  ];
  cliArgs.push(`--json=${jsonFields.join(',')}`);

  return { command, cliArgs, composedQuery: queryString };
}
