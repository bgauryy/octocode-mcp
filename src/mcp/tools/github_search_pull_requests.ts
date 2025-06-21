import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubPullRequestsSearchParams,
  GitHubPullRequestsSearchResult,
  GitHubPullRequestItem,
} from '../../types';
import { createSuccessResult, createErrorResult } from '../../utils/responses';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';

// TODO: add PR commeents. e.g, gh pr view <PR_NUMBER_OR_URL_OR_BRANCH> --comments

const TOOL_NAME = 'github_search_pull_requests';

const DESCRIPTION = `Find pull requests and implementations with detailed metadata. Discover feature implementations, code review patterns, and development workflows.

SEARCH PATTERNS:
 Boolean: "fix AND bug", "refactor OR cleanup", "feature NOT draft"
 Exact phrases: "initial commit" (quoted)
 GitHub qualifiers: "is:merged review:approved base:main"
 Combine with filters for targeted PR discovery`;

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          'Search query with GITHUB SEARCH SYNTAX support. BOOLEAN OPERATORS: "fix AND bug" (both required), "refactor OR cleanup" (either term), "feature NOT draft" (excludes). EXACT PHRASES: "initial commit" (precise matching). GITHUB QUALIFIERS: "is:merged review:approved base:main" (native GitHub syntax). COMBINED: Mix boolean logic with qualifiers for precise PR discovery.'
        ),
      owner: z.string().optional().describe('Repository owner/organization'),
      repo: z.string().optional().describe('Repository name'),
      author: z.string().optional().describe('Filter by pull request author'),
      assignee: z.string().optional().describe('Filter by assignee'),
      mentions: z.string().optional().describe('Filter by user mentions'),
      commenter: z.string().optional().describe('Filter by comments by user'),
      involves: z.string().optional().describe('Filter by user involvement'),
      reviewedBy: z.string().optional().describe('Filter by user who reviewed'),
      reviewRequested: z
        .string()
        .optional()
        .describe('Filter by user or team requested to review'),
      state: z.enum(['open', 'closed']).optional().describe('Filter by state'),
      head: z.string().optional().describe('Filter by head branch name'),
      base: z.string().optional().describe('Filter by base branch name'),
      language: z.string().optional().describe('Filter by coding language'),
      created: z
        .string()
        .optional()
        .describe("Filter by created date (e.g., '>2022-01-01')"),
      updated: z.string().optional().describe('Filter by last updated date'),
      mergedAt: z.string().optional().describe('Filter by merged date'),
      closed: z.string().optional().describe('Filter by closed date'),
      draft: z.boolean().optional().describe('Filter by draft state'),
      checks: z
        .enum(['pending', 'success', 'failure'])
        .optional()
        .describe('Filter based on status of the checks'),
      merged: z.boolean().optional().describe('Filter based on merged state'),
      review: z
        .enum(['none', 'required', 'approved', 'changes_requested'])
        .optional()
        .describe('Filter based on review status'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(25)
        .describe('Maximum results (default: 25, max: 50)'),
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
        .describe('Sort criteria'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order (default: desc)'),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubPullRequestsSearchParams) => {
      if (!args.query?.trim()) {
        return createErrorResult(
          'Search query is required and cannot be empty - provide keywords to search for pull requests',
          new Error('Invalid query')
        );
      }

      if (args.query.length > 256) {
        return createErrorResult(
          'Search query is too long. Please limit to 256 characters or less - simplify your search terms',
          new Error('Query too long')
        );
      }

      try {
        return await searchGitHubPullRequests(args);
      } catch (error) {
        return createErrorResult(
          'GitHub pull requests search failed - verify repository access and query syntax',
          error
        );
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
    const apiResponse = JSON.parse(execResult.result);
    const pullRequests = apiResponse.items || [];

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
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          url: pr.html_url,
          comments: pr.comments,
          reactions: pr.reactions?.total_count || 0,
          draft: pr.draft,
        };

        // Only include optional fields if they have values
        if (pr.merged_at) result.merged_at = pr.merged_at;
        if (pr.closed_at) result.closed_at = pr.closed_at;
        if (pr.head?.ref) result.head = pr.head.ref;
        if (pr.base?.ref) result.base = pr.base.ref;

        return result;
      }
    );

    const searchResult: GitHubPullRequestsSearchResult = {
      searchType: 'prs',
      query: params.query || '',
      results: cleanPRs,
      metadata: {
        total_count: apiResponse.total_count || 0,
        incomplete_results: apiResponse.incomplete_results || false,
      },
    };

    return createSuccessResult(searchResult);
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
  if (params.reviewedBy) queryParts.push(`reviewed-by:${params.reviewedBy}`);
  if (params.reviewRequested)
    queryParts.push(`review-requested:${params.reviewRequested}`);
  if (params.head) queryParts.push(`head:${params.head}`);
  if (params.base) queryParts.push(`base:${params.base}`);
  if (params.mergedAt) queryParts.push(`merged:${params.mergedAt}`);
  if (params.draft !== undefined) queryParts.push(`draft:${params.draft}`);
  if (params.checks) queryParts.push(`status:${params.checks}`);
  if (params.merged !== undefined)
    queryParts.push(`is:${params.merged ? 'merged' : 'unmerged'}`);
  if (params.review) queryParts.push(`review:${params.review}`);

  // Add type qualifier to search only pull requests
  queryParts.push('type:pr');

  const query = queryParts.filter(Boolean).join(' ');
  const limit = Math.min(params.limit || 25, 100);

  let apiPath = `search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`;
  if (params.sort) apiPath += `&sort=${params.sort}`;
  if (params.order) apiPath += `&order=${params.order}`;

  return { command: 'api', args: [apiPath] };
}
