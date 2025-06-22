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
  needsQuoting,
  formatDateToYYYYMMDD,
} from '../../utils/responses';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
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

    if (
      execResult.isError ||
      !execResult.content ||
      execResult.content.length === 0 ||
      !execResult.content[0].text
    ) {
      return execResult.isError
        ? execResult
        : createErrorResult(
            `Failed to execute 'gh search prs'. Output was empty or invalid. Query: ${composedQuery}`
          );
    }

    let rawItems: GhRawPullRequestItem[];
    try {
      rawItems = JSON.parse(execResult.content[0].text as string);
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
  const cliArgs: string[] = ['prs']; // Subcommand for gh search

  const queryParts: string[] = [];
  if (params.query && params.query.trim() !== '') {
    queryParts.push(params.query.trim());
  }

  // Handle repo and owner filters to form repo:owner/name strings
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const owners = Array.isArray(params.owner)
      ? params.owner
      : params.owner
        ? [params.owner]
        : [];
    repos.forEach((repoName, index) => {
      // If owners array is shorter, reuse last owner or none
      const ownerName =
        owners[index] || (owners.length > 0 ? owners[owners.length - 1] : null);
      if (ownerName) {
        queryParts.push(`repo:${ownerName}/${repoName}`);
      } else {
        // If only repo is specified, and no general owner filter. This might be ambiguous.
        // gh CLI might search repos named `repoName` across user's accessible repos.
        // Or, if a single --owner is globally specified, it might combine. For clarity, prefer explicit owner/repo.
        queryParts.push(`repo:${repoName}`);
      }
    });
  } else if (params.owner) {
    // Only owner(s), no specific repo(s)
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(ownerName => queryParts.push(`owner:${ownerName}`)); // or user:${ownerName}, org:${ownerName}
  }

  // Standard simple filters
  if (params.author) queryParts.push(`author:${params.author}`);
  if (params.assignee) queryParts.push(`assignee:${params.assignee}`);
  if (params.mentions) queryParts.push(`mentions:${params.mentions}`);
  if (params.commenter) queryParts.push(`commenter:${params.commenter}`);
  if (params.involves) queryParts.push(`involves:${params.involves}`);
  if (params.reviewedBy) queryParts.push(`reviewed-by:${params.reviewedBy}`);
  if (params.reviewRequested)
    queryParts.push(`review-requested:${params.reviewRequested}`);
  if (params.teamMentions) queryParts.push(`team:${params.teamMentions}`); // gh uses `team:` for team-mentions
  if (params.state) queryParts.push(`state:${params.state}`);
  if (params.head) queryParts.push(`head:${params.head}`);
  if (params.base) queryParts.push(`base:${params.base}`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.milestone)
    queryParts.push(
      `milestone:${needsQuoting(params.milestone) ? `"${params.milestone}"` : params.milestone}`
    );
  if (params.project) queryParts.push(`project:${params.project}`); // Format: org/project_number
  if (params.app) queryParts.push(`app:${params.app}`);

  // Date filters
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);
  if (params.mergedAt) queryParts.push(`merged:${params.mergedAt}`); // `merged` qualifier takes date/range
  if (params.closed) queryParts.push(`closed:${params.closed}`);

  // Numeric range filters
  if (params.comments) queryParts.push(`comments:${params.comments}`);
  if (params.reactions) queryParts.push(`reactions:${params.reactions}`);
  if (params.interactions)
    queryParts.push(`interactions:${params.interactions}`);

  // Boolean-like flags / keyword filters
  if (params.draft === true) queryParts.push('is:draft');
  if (params.draft === false) queryParts.push('-is:draft'); // or is:open (if not draft is sought among open)
  if (params.merged === true) queryParts.push('is:merged');
  if (params.merged === false) queryParts.push('is:unmerged');
  if (params.locked === true) queryParts.push('is:locked');
  if (params.locked === false) queryParts.push('-is:locked');
  if (params.archived === true) queryParts.push('archived:true');
  if (params.archived === false) queryParts.push('archived:false');
  if (params.noAssignee) queryParts.push('no:assignee');
  if (params.noLabel) queryParts.push('no:label');
  if (params.noMilestone) queryParts.push('no:milestone');
  if (params.noProject) queryParts.push('no:project');

  // Array filters
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(l =>
      queryParts.push(`label:${needsQuoting(l) ? `"${l}"` : l}`)
    );
  }
  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(m => queryParts.push(`in:${m}`));
  }
  if (params.visibility) {
    const visibilities = Array.isArray(params.visibility)
      ? params.visibility
      : [params.visibility];
    visibilities.forEach(v => queryParts.push(`is:${v}`));
  }

  // Status and review filters
  if (params.checks) queryParts.push(`checks:${params.checks}`);
  if (params.review) queryParts.push(`review:${params.review}`);

  const composedQuery = queryParts.filter(Boolean).join(' ');
  if (composedQuery) {
    cliArgs.push(composedQuery);
  }
  // If composedQuery is empty, gh search prs will show an error, which is fine.
  // Zod schema ensures params.query is min(1), so it won't be empty unless only filters are used
  // and those filters also result in an empty string (e.g. all optional filters are undefined)
  // In such a case, the gh command would be `gh search prs --limit X --json Y` which is valid and shows recent PRs.

  // CLI flags for sorting and limits
  if (params.sort) cliArgs.push(`--sort=${params.sort}`);
  if (params.order) cliArgs.push(`--order=${params.order}`); // gh default is desc
  cliArgs.push(`--limit=${params.limit || 30}`);

  // Request necessary JSON fields
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
    'author', // object with login
    'repository', // object with fullName
    'labels', // array of objects with name
    'assignees', // array of objects with login
    'authorAssociation',
  ];
  cliArgs.push(`--json=${jsonFields.join(',')}`);

  return { command, cliArgs, composedQuery };
}
