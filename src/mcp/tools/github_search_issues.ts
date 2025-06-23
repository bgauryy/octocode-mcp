import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubIssuesSearchParams,
  GitHubIssuesSearchResult,
  GitHubIssueItem,
} from '../../types';
import { createResult } from '../../utils/responses';
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
          .min(1, 'Search query is required and cannot be empty')
          .describe(
            'Search query with GitHub syntax. Boolean: "bug AND crash", exact phrases: "memory leak", qualifiers: "is:open label:bug".'
          ),
        owner: z
          .string()
          .min(1)
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
        app: z.string().optional().describe('Filter by GitHub App author'),
        archived: z
          .boolean()
          .optional()
          .describe('Filter by repository archived state'),
        assignee: z.string().optional().describe('Filter by assignee'),
        author: z.string().optional().describe('Filter by issue author'),
        closed: z.string().optional().describe('Filter by closed date'),
        commenter: z
          .string()
          .optional()
          .describe('Filter by user who commented'),
        comments: z
          .number()
          .optional()
          .describe('Filter by number of comments'),
        created: z.string().optional().describe('Filter by created date'),
        includePrs: z
          .boolean()
          .optional()
          .describe('Include pull requests in results'),
        interactions: z
          .number()
          .optional()
          .describe('Filter by reactions and comments count'),
        involves: z.string().optional().describe('Filter by user involvement'),
        labels: z.string().optional().describe('Filter by labels'),
        language: z.string().optional().describe('Filter by coding language'),
        locked: z
          .boolean()
          .optional()
          .describe('Filter by locked conversation status'),
        match: z
          .enum(['title', 'body', 'comments'])
          .optional()
          .describe('Restrict search to specific field'),
        mentions: z.string().optional().describe('Filter by user mentions'),
        milestone: z.string().optional().describe('Filter by milestone title'),
        noAssignee: z
          .boolean()
          .optional()
          .describe('Filter by missing assignee'),
        noLabel: z.boolean().optional().describe('Filter by missing label'),
        noMilestone: z
          .boolean()
          .optional()
          .describe('Filter by missing milestone'),
        noProject: z.boolean().optional().describe('Filter by missing project'),
        project: z.string().optional().describe('Filter by project board'),
        reactions: z.number().optional().describe('Filter by reactions count'),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Filter by issue state'),
        teamMentions: z.string().optional().describe('Filter by team mentions'),
        updated: z.string().optional().describe('Filter by last updated date'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter by repository visibility'),
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
          .describe('Sort criteria'),
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
        title: 'GitHub Issues Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubIssuesSearchParams): Promise<CallToolResult> => {
      if (!args.query?.trim()) {
        return createResult({
          error:
            'Search query is required and cannot be empty - provide keywords to search for issues',
        });
      }

      if (args.query.length > 256) {
        return createResult({
          error:
            'Search query is too long. Please limit to 256 characters or less - simplify your search terms',
        });
      }

      try {
        return await searchGitHubIssues(args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('authentication')) {
          return createResult({
            error: 'GitHub authentication required - run api_status_check tool',
          });
        }

        if (errorMessage.includes('rate limit')) {
          return createResult({
            error: 'GitHub rate limit exceeded - wait or use specific filters',
          });
        }

        // Generic fallback
        return createResult({
          error:
            'GitHub issue search failed - check authentication or simplify query',
        });
      }
    }
  );
}

async function searchGitHubIssues(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-issues', params);

  return withCache(cacheKey, async () => {
    const { command, args } = buildGitHubIssuesAPICommand(params);
    const result = await executeGitHubCommand(command, args, { cache: false });

    if (result.isError) {
      return result;
    }

    const execResult = JSON.parse(result.content[0].text as string);
    const apiResponse = JSON.parse(execResult.result);
    const issues = apiResponse.items || [];

    const cleanIssues: GitHubIssueItem[] = issues.map(
      (issue: {
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
      }) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login || '',
        repository:
          issue.repository_url?.split('/').slice(-2).join('/') || 'unknown',
        labels: issue.labels?.map(l => l.name) || [],
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        url: issue.html_url,
        comments: issue.comments,
        reactions: issue.reactions?.total_count || 0,
      })
    );

    const searchResult: GitHubIssuesSearchResult = {
      searchType: 'issues',
      query: params.query || '',
      results: cleanIssues,
      metadata: {
        total_count: apiResponse.total_count || 0,
        incomplete_results: apiResponse.incomplete_results || false,
      },
    };

    return createResult({ data: searchResult });
  });
}

function buildGitHubIssuesAPICommand(params: GitHubIssuesSearchParams): {
  command: GhCommand;
  args: string[];
} {
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
    language: params.language,
    state: params.state,
    created: params.created,
    updated: params.updated,
    closed: params.closed,
  };

  Object.entries(qualifiers).forEach(([key, value]) => {
    if (value) queryParts.push(`${key}:${value}`);
  });

  // Special qualifiers - only quote when necessary for GitHub search syntax
  if (params.labels) queryParts.push(`label:"${params.labels}"`);
  if (params.milestone) queryParts.push(`milestone:"${params.milestone}"`);
  if (params.noAssignee) queryParts.push('no:assignee');
  if (params.noLabel) queryParts.push('no:label');
  if (params.noMilestone) queryParts.push('no:milestone');
  if (params.archived !== undefined)
    queryParts.push(`archived:${params.archived}`);
  if (params.locked) queryParts.push('is:locked');
  if (params.visibility) queryParts.push(`is:${params.visibility}`);

  const query = queryParts.filter(Boolean).join(' ');
  const limit = Math.min(params.limit || 25, 100);

  let apiPath = `search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`;
  if (params.sort) apiPath += `&sort=${params.sort}`;
  if (params.order) apiPath += `&order=${params.order}`;

  return { command: 'api', args: [apiPath] };
}
