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

// TODO: add PR commeents. e.g, gh pr view <PR_NUMBER_OR_URL_OR_BRANCH> --comments

export const GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME = 'githubSearchPullRequests';

const DESCRIPTION = `Search GitHub pull requests for code changes, feature implementations, and bug fixes. Find PRs by keywords, state, author, review status, or repository. Returns PR number, title, state, branches, and review information for code review analysis.`;

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
            'Search terms. Start simple: "refactor", "optimization". Use quotes for exact phrases.'
          ),
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/organization name only (e.g., "facebook", "microsoft"). Do NOT include repository name. Must be used with repo parameter for repository-specific searches.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name only (e.g., "react", "vscode"). Do NOT include owner prefix. Must be used together with owner parameter.'
          ),
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
          .describe('PR state. Default: all'),
        head: z.string().optional().describe('Source branch name'),
        base: z.string().optional().describe('Target branch name'),
        language: z.string().optional().describe('Repository language'),
        created: z
          .string()
          .optional()
          .describe('When created. Format: >2020-01-01'),
        updated: z
          .string()
          .optional()
          .describe('When updated. Format: >2020-01-01'),
        'merged-at': z
          .string()
          .optional()
          .describe('When merged. Format: >2020-01-01'),
        closed: z
          .string()
          .optional()
          .describe('When closed. Format: >2020-01-01'),
        draft: z.boolean().optional().describe('Draft PR status'),
        checks: z
          .enum(['pending', 'success', 'failure'])
          .optional()
          .describe('CI/CD check status'),
        merged: z
          .boolean()
          .optional()
          .describe('Only merged PRs (true) or unmerged (false)'),
        review: z
          .enum(['none', 'required', 'approved', 'changes_requested'])
          .optional()
          .describe('Review status filter'),
        app: z.string().optional().describe('GitHub App that created the PR'),
        archived: z
          .boolean()
          .optional()
          .describe('Include archived repositories'),
        comments: z
          .number()
          .optional()
          .describe('Comment count filter. Format: >10, <5, 5..10'),
        interactions: z
          .number()
          .optional()
          .describe('Total interactions (reactions + comments)'),
        'team-mentions': z
          .string()
          .optional()
          .describe('Team mentioned in PR (@org/team-name)'),
        reactions: z
          .number()
          .optional()
          .describe('Reaction count filter. Format: >10'),
        locked: z.boolean().optional().describe('Conversation locked status'),
        'no-assignee': z.boolean().optional().describe('PRs without assignee'),
        'no-label': z.boolean().optional().describe('PRs without labels'),
        'no-milestone': z
          .boolean()
          .optional()
          .describe('PRs without milestone'),
        'no-project': z.boolean().optional().describe('PRs not in projects'),
        label: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Label names. Can be single string or array.'),
        milestone: z.string().optional().describe('Milestone title'),
        project: z.string().optional().describe('Project board owner/number'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility'),
        match: z
          .enum(['title', 'body', 'comments'])
          .optional()
          .describe('Search scope. Default: title and body'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Results limit (1-50). Default: 25'),
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
          .describe('Sort by activity or reactions. Default: best match'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order. Default: desc'),
      },
      annotations: {
        title: 'GitHub PR Search - Implementation Discovery',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
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
      return result;
    }

    const execResult = JSON.parse(result.content[0].text as string);
    const apiResponse = execResult.result;
    const pullRequests = apiResponse.items || [];

    if (pullRequests.length === 0) {
      return createResult({
        error: createNoResultsError('pull_requests'),
      });
    }

    const cleanPRs: GitHubPullRequestItem[] = pullRequests.map(
      (pr: {
        number: number;
        title: string;
        state: 'open' | 'closed';
        user?: { login: string };
        repository_url?: string;
        labels?: Array<{ name: string }>;
        created_at: string;
        updated_at: string;
        html_url: string;
        comments: number;
        reactions?: { total_count: number };
        draft: boolean;
        merged_at?: string;
        closed_at?: string;
        head?: { ref: string };
        base?: { ref: string };
      }) => {
        const result: GitHubPullRequestItem = {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login || '',
          repository:
            pr.repository_url?.split('/').slice(-2).join('/') || 'unknown',
          labels: pr.labels?.map(l => l.name) || [],
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

        return result;
      }
    );

    const searchResult: GitHubPullRequestsSearchResult = {
      results: cleanPRs,
      total_count: apiResponse.total_count || cleanPRs.length,
    };

    return createResult({ data: searchResult });
  });
}

function buildGitHubPullRequestsAPICommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  const queryParts: string[] = [params.query?.trim() || ''];

  // Repository/organization qualifiers
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`org:${params.owner}`);
  }

  // Build search qualifiers from params
  const qualifiers: Record<string, string | undefined> = {
    author: params.author,
    assignee: params.assignee,
    mentions: params.mentions,
    commenter: params.commenter,
    involves: params.involves,
    state: params.state,
    created: params.created,
    updated: params.updated,
    closed: params.closed,
    language: params.language,
  };

  Object.entries(qualifiers).forEach(([key, value]) => {
    if (value) queryParts.push(`${key}:${value}`);
  });

  // Special qualifiers
  if (params['reviewed-by'])
    queryParts.push(`reviewed-by:${params['reviewed-by']}`);
  if (params['review-requested'])
    queryParts.push(`review-requested:${params['review-requested']}`);
  if (params.head) queryParts.push(`head:${params.head}`);
  if (params.base) queryParts.push(`base:${params.base}`);
  if (params['merged-at']) queryParts.push(`merged:${params['merged-at']}`);
  if (params.draft !== undefined) queryParts.push(`draft:${params.draft}`);
  if (params.checks) queryParts.push(`status:${params.checks}`);
  if (params.merged !== undefined)
    queryParts.push(`is:${params.merged ? 'merged' : 'unmerged'}`);
  if (params.review) queryParts.push(`review:${params.review}`);

  // Additional parameters
  if (params.app) queryParts.push(`app:${params.app}`);
  if (params.archived !== undefined)
    queryParts.push(`archived:${params.archived}`);
  if (params.comments) queryParts.push(`comments:${params.comments}`);
  if (params.interactions)
    queryParts.push(`interactions:${params.interactions}`);
  if (params.reactions) queryParts.push(`reactions:${params.reactions}`);
  if (params.locked) queryParts.push('is:locked');
  if (params.visibility) queryParts.push(`is:${params.visibility}`);
  if (params['team-mentions'])
    queryParts.push(`team:${params['team-mentions']}`);
  if (params['no-assignee']) queryParts.push('no:assignee');
  if (params['no-label']) queryParts.push('no:label');
  if (params['no-milestone']) queryParts.push('no:milestone');
  if (params['no-project']) queryParts.push('no:project');
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => queryParts.push(`label:"${label}"`));
  }
  if (params.milestone) queryParts.push(`milestone:"${params.milestone}"`);
  if (params.project) queryParts.push(`project:${params.project}`);

  // Add type qualifier to search only pull requests
  queryParts.push('type:pr');

  const query = queryParts.filter(Boolean).join(' ');
  const limit = Math.min(params.limit || 25, 100);

  let apiPath = `search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`;
  if (params.sort) apiPath += `&sort=${params.sort}`;
  if (params.order) apiPath += `&order=${params.order}`;

  return { command: 'api', args: [apiPath] };
}
