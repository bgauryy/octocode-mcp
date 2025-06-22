import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubIssuesSearchParams,
  // GitHubIssuesSearchResult, // Old, replaced by GitHubIssuesQueryResult
  // GitHubIssueItem, // Old, replaced by ProcessedIssueItem
  GhCliIssueItem, // New
  ProcessedIssueItem, // New
  GitHubIssuesQueryResult, // New
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

const TOOL_NAME = 'github_search_issues';

const DESCRIPTION = `Find GitHub issues with rich metadata. Discover pain points, feature requests, and bug patterns with boolean logic and GitHub qualifiers.`;

export function registerSearchGitHubIssuesTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1, 'Search query is required and cannot be empty.')
          .max(256, 'Search query too long. Max 256 characters.')
          .describe(
            'Search query with GitHub syntax. Boolean: "bug AND crash", exact phrases: "memory leak", qualifiers: "is:open label:bug".'
          ),
        owner: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Repository owner/organization. Used to scope search if `repo` is also provided, or for org-wide searches.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name. If provided with `owner`, scopes to "owner/repo". Can be just "repo" if context implies owner.'
          ),
        app: z
          .string()
          .optional()
          .describe('Filter by GitHub App author (username).'),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Filter by repository archived state. Use `true` or `false`.'
          ),
        assignee: z
          .string()
          .optional()
          .describe('Filter by assignee (username).'),
        author: z
          .string()
          .optional()
          .describe('Filter by issue author (username).'),
        closed: z
          .string()
          .optional()
          .describe(
            'Filter by closed date (e.g., YYYY-MM-DD, <YYYY-MM-DD, >YYYY-MM-DD).'
          ),
        commenter: z
          .string()
          .optional()
          .describe('Filter by user who commented (username).'),
        comments: z
          .string() // Changed from number
          .optional()
          .describe(
            'Filter by number of comments (e.g., "10", ">10", "0..5").'
          ),
        created: z
          .string()
          .optional()
          .describe(
            'Filter by created date (e.g., YYYY-MM-DD, <YYYY-MM-DD, >YYYY-MM-DD).'
          ),
        includePrs: z
          .boolean()
          .optional()
          .describe(
            'Include pull requests in results (defaults to false, issues only).'
          ),
        interactions: z
          .string() // Changed from number
          .optional()
          .describe('Filter by reactions and comments count (e.g., ">=5").'),
        involves: z
          .string()
          .optional()
          .describe('Filter by user involvement (username).'),
        // `label` (singular) is often used for one label in CLI, `labels` (plural) for multiple.
        // GitHub search query syntax uses `label:name` which can be repeated.
        label: z
          .string()
          .optional()
          .describe(
            'Filter by a single label name. For multiple, include in query string e.g., "label:bug label:docs".'
          ),
        labels: z
          .string()
          .optional()
          .describe(
            'DEPRECATED: Use `label` for a single label or include multiple `label:name` in the main query string.'
          ),
        language: z
          .string()
          .optional()
          .describe('Filter by coding language of the repository.'),
        locked: z
          .boolean()
          .optional()
          .describe(
            'Filter by locked conversation status. Use `true` or `false`.'
          ),
        match: z
          .enum(['title', 'body', 'comments'])
          .optional()
          .describe(
            'Restrict search to title, body, or comments. CLI default is all.'
          ),
        mentions: z
          .string()
          .optional()
          .describe('Filter by user mentions (username).'),
        milestone: z
          .string()
          .optional()
          .describe('Filter by milestone title (quote if contains spaces).'),
        noAssignee: z
          .boolean()
          .optional()
          .describe('Filter for issues with no assignee. Use `true`.'),
        noLabel: z
          .boolean()
          .optional()
          .describe('Filter for issues with no labels. Use `true`.'),
        noMilestone: z
          .boolean()
          .optional()
          .describe('Filter for issues with no milestone. Use `true`.'),
        noProject: z
          .boolean()
          .optional()
          .describe('Filter for issues with no project. Use `true`.'),
        project: z
          .string()
          .optional()
          .describe(
            'Filter by project board (owner/number, e.g., "myorg/123").'
          ),
        reactions: z
          .string() // Changed from number
          .optional()
          .describe('Filter by reactions count (e.g., "0", ">=100").'),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Filter by issue state.'),
        teamMentions: z
          .string()
          .optional()
          .describe('Filter by team mentions (org/team-slug).'),
        updated: z
          .string()
          .optional()
          .describe(
            'Filter by last updated date (e.g., YYYY-MM-DD, <YYYY-MM-DD, >YYYY-MM-DD).'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter by repository visibility.'),
        sort: z
          .enum([
            'comments',
            'created',
            'interactions',
            'reactions',
            'reactions-+1',
            'reactions--1',
            'reactions-heart',
            'reactions-smile',
            'reactions-tada',
            'reactions-thinking_face',
            'updated',
            'best-match',
          ])
          .optional()
          .default('best-match') // CLI default is best-match
          .describe('Sort criteria.'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order (default: desc).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100) // Increased max limit, gh default 30, max can be higher via API
          .optional()
          .default(30) // Align with gh cli default
          .describe('Maximum results (default: 30, max: 100).'),
      },
      annotations: {
        title: 'GitHub Issues Search',
        readOnlyHint: true,
      },
    },
    async (args: GitHubIssuesSearchParams): Promise<CallToolResult> => {
      // Basic validation already in Zod schema (min:1, max:256 for query)
      try {
        return await searchGitHubIssuesWithCache(args);
      } catch (error) {
        // This is a fallback, specific errors should be CallToolResult from searchGitHubIssuesWithCache
        return createErrorResult(
          'GitHub issue search failed unexpectedly.',
          true
        );
      }
    }
  );
}

async function searchGitHubIssuesWithCache(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-issues', params);
  return withCache(cacheKey, async () => {
    return searchGitHubIssuesLogic(params);
  });
}

async function searchGitHubIssuesLogic(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  try {
    const { command, args, composedQuery } =
      buildGitHubIssuesCLICommand(params);
    const cliResult = await executeGitHubCommand(command, args, {
      cache: false,
    });

    if (cliResult.isError) {
      // Pass CLI errors directly if they are already CallToolResult
      return cliResult;
    }

    const execResult = JSON.parse(cliResult.content[0].text as string);
    // gh search issues --json returns a direct array of issues
    const rawIssues = JSON.parse(execResult.result) as GhCliIssueItem[];

    if (!Array.isArray(rawIssues)) {
      return createErrorResult(
        'GitHub CLI returned non-array data for issues search.'
      );
    }

    const processedIssues: ProcessedIssueItem[] = rawIssues.map(
      (issue: GhCliIssueItem): ProcessedIssueItem => {
        const repoFullName =
          typeof issue.repository === 'string'
            ? issue.repository
            : issue.repository?.fullName;

        return {
          issue_number: issue.number,
          title: issue.title,
          state: issue.state,
          author_login: issue.author?.login,
          repository_full_name: repoFullName,
          labels_names: issue.labels?.map(l => l.name),
          created_date: formatDateToYYYYMMDD(issue.createdAt) || undefined,
          updated_date: formatDateToYYYYMMDD(issue.updatedAt) || undefined,
          closed_date: formatDateToYYYYMMDD(issue.closedAt),
          html_url: issue.url,
          comments_count: issue.commentsCount,
          is_pull_request: issue.isPullRequest || false,
          is_locked: issue.isLocked || false,
          assignees_logins: issue.assignees?.map(a => a.login),
          body_snippet:
            issue.body?.substring(0, 150) +
            (issue.body && issue.body.length > 150 ? '...' : ''),
        };
      }
    );

    const searchResult: GitHubIssuesQueryResult = {
      query_used: composedQuery,
      total_returned: rawIssues.length,
      issues: processedIssues,
    };

    return createSuccessResult(searchResult);
  } catch (error) {
    // Catch errors from JSON parsing or other internal issues
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error during issue search logic.';
    if (message.includes('authentication')) {
      return createErrorResult(
        'GitHub authentication required | Try: run api_status_check tool or verify GitHub CLI login',
        error as Error
      );
    }
    if (message.includes('rate limit')) {
      return createErrorResult(
        'GitHub rate limit exceeded | Try: wait, use specific filters, or narrow search scope',
        error as Error
      );
    }
    return createErrorResult(`Issue search failed internally: ${message}`);
  }
}

function buildGitHubIssuesCLICommand(params: GitHubIssuesSearchParams): {
  command: GhCommand;
  args: string[];
  composedQuery: string;
} {
  const command: GhCommand = 'search';
  const cliArgs: string[] = ['issues'];

  // Start with the main query from params.query
  let queryString = params.query.trim();

  // Append other filters to the query string itself using GitHub search syntax
  const queryFilters: string[] = [];

  if (params.owner && params.repo) {
    queryFilters.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryFilters.push(`org:${params.owner}`); // or user:${params.owner}
  } else if (params.repo) {
    // If repo is specified without owner, it might be ambiguous.
    // For 'gh search issues', repo usually needs owner context.
    // However, let gh cli handle if it's part of a global search intent.
    queryFilters.push(`repo:${params.repo}`);
  }

  if (params.app) queryFilters.push(`app:${params.app}`);
  if (typeof params.archived === 'boolean')
    queryFilters.push(`archived:${params.archived}`);
  if (params.assignee) queryFilters.push(`assignee:${params.assignee}`);
  if (params.author) queryFilters.push(`author:${params.author}`);
  if (params.closed) queryFilters.push(`closed:${params.closed}`);
  if (params.commenter) queryFilters.push(`commenter:${params.commenter}`);
  if (params.comments) queryFilters.push(`comments:${params.comments}`);
  if (params.created) queryFilters.push(`created:${params.created}`);
  if (typeof params.includePrs === 'boolean') {
    // Only add if explicitly set
    queryFilters.push(params.includePrs ? 'is:pr' : 'is:issue'); // map to is:pr or is:issue
  }
  if (params.interactions)
    queryFilters.push(`interactions:${params.interactions}`);
  if (params.involves) queryFilters.push(`involves:${params.involves}`);
  if (params.label)
    queryFilters.push(
      `label:${needsQuoting(params.label) ? `"${params.label}"` : params.label}`
    );
  // `labels` (plural) is deprecated in favor of `label` or in-query `label:name label:another`
  if (params.language) queryFilters.push(`language:${params.language}`);
  if (typeof params.locked === 'boolean')
    queryFilters.push(`is:locked:${params.locked}`); // is:locked or -is:locked (gh syntax doesn't use true/false here)
  // actually gh cli flag is just --locked for true. For query, it's is:locked or -is:locked
  // For query string: is:locked or NOT is:locked
  if (params.match) queryFilters.push(`in:${params.match}`); // `in:` qualifier in GitHub search
  if (params.mentions) queryFilters.push(`mentions:${params.mentions}`);
  if (params.milestone)
    queryFilters.push(
      `milestone:${needsQuoting(params.milestone) ? `"${params.milestone}"` : params.milestone}`
    );
  if (params.noAssignee) queryFilters.push('no:assignee');
  if (params.noLabel) queryFilters.push('no:label');
  if (params.noMilestone) queryFilters.push('no:milestone');
  if (params.noProject) queryFilters.push('no:project');
  if (params.project) queryFilters.push(`project:${params.project}`);
  if (params.reactions) queryFilters.push(`reactions:${params.reactions}`);
  if (params.state) queryFilters.push(`state:${params.state}`); // or is:open, is:closed
  if (params.teamMentions) queryFilters.push(`team:${params.teamMentions}`);
  if (params.updated) queryFilters.push(`updated:${params.updated}`);
  if (params.visibility) queryFilters.push(`is:${params.visibility}`);

  if (queryFilters.length > 0) {
    queryString = `${queryString} ${queryFilters.join(' ')}`.trim();
  }

  cliArgs.push(queryString);

  // Add CLI-specific flags
  if (params.sort && params.sort !== 'best-match')
    cliArgs.push(`--sort=${params.sort}`);
  if (params.order) cliArgs.push(`--order=${params.order}`);
  if (params.limit) cliArgs.push(`--limit=${params.limit}`);

  // JSON fields from gh search issues --help
  const jsonFields = [
    'number',
    'title',
    'state',
    'author',
    'repository',
    'labels',
    'createdAt',
    'updatedAt',
    'closedAt',
    'url',
    'commentsCount',
    'isPullRequest',
    'isLocked',
    'assignees',
    'body',
    'id',
    // 'authorAssociation' // Not strictly needed for ProcessedIssueItem
  ];
  cliArgs.push(`--json=${jsonFields.join(',')}`);

  return { command, args: cliArgs, composedQuery: queryString };
}
