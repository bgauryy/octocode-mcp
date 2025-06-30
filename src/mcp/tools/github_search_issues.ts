import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubIssuesSearchParams,
  GitHubIssuesSearchResult,
  GitHubIssueItem,
} from '../../types';
import { createResult, toDDMMYYYY } from '../responses';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import {
  ERROR_MESSAGES,
  SUGGESTIONS,
  createAuthenticationError,
  createRateLimitError,
  createSearchFailedError,
} from '../errorMessages';

export const GITHUB_SEARCH_ISSUES_TOOL_NAME = 'githubSearchIssues';

const DESCRIPTION = `Search GitHub issues for bug discovery and feature analysis. Supports filtering by state, labels, assignee, dates, and more. Parameters: query (required), owner (optional - GitHub username/org, NOT owner/repo), repo (optional - repository name, use with owner for specific repo), app (optional), archived (optional), assignee (optional), author (optional), closed (optional), commenter (optional), comments (optional), created (optional), includePrs (optional), interactions (optional), involves (optional), labels (optional), language (optional), locked (optional), match (optional), mentions (optional), milestone (optional), noAssignee (optional), noLabel (optional), noMilestone (optional), noProject (optional), project (optional), reactions (optional), state (optional), teamMentions (optional), updated (optional), visibility (optional), sort (optional), order (optional), limit (optional).`;

export function registerSearchGitHubIssuesTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_ISSUES_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1, 'Search query is required and cannot be empty')
          .describe(
            'Search terms. Start simple: "error", "crash". Use quotes for exact phrases.'
          ),
        owner: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Repository owner/org name only (e.g., "microsoft", "google", NOT "microsoft/vscode"). Use with repo parameter for repository-specific searches.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name only (e.g., "vscode", "react", NOT "owner/repo"). Must be used together with owner parameter.'
          ),
        app: z
          .string()
          .optional()
          .describe('GitHub App that created the issue'),
        archived: z
          .boolean()
          .optional()
          .describe('Include archived repositories'),
        assignee: z.string().optional().describe('GitHub username of assignee'),
        author: z
          .string()
          .optional()
          .describe('GitHub username of issue creator'),
        closed: z
          .string()
          .optional()
          .describe('When closed. Format: >2020-01-01'),
        commenter: z
          .string()
          .optional()
          .describe('User who commented on issue'),
        comments: z
          .number()
          .optional()
          .describe('Comment count. Format: >10, <5, 5..10'),
        created: z
          .string()
          .optional()
          .describe('When created. Format: >2020-01-01'),
        includePrs: z
          .boolean()
          .optional()
          .describe('Include pull requests. Default: false'),
        interactions: z
          .number()
          .optional()
          .describe('Total interactions (reactions + comments)'),
        involves: z.string().optional().describe('User involved in any way'),
        labels: z
          .string()
          .optional()
          .describe('Label names (bug, feature, etc.)'),
        language: z.string().optional().describe('Repository language'),
        locked: z.boolean().optional().describe('Conversation locked status'),
        match: z
          .enum(['title', 'body', 'comments'])
          .optional()
          .describe('Search scope. Default: title and body'),
        mentions: z.string().optional().describe('Issues mentioning this user'),
        milestone: z.string().optional().describe('Milestone name'),
        noAssignee: z.boolean().optional().describe('Issues without assignee'),
        noLabel: z.boolean().optional().describe('Issues without labels'),
        noMilestone: z
          .boolean()
          .optional()
          .describe('Issues without milestone'),
        noProject: z.boolean().optional().describe('Issues not in projects'),
        project: z.string().optional().describe('Project board number'),
        reactions: z
          .number()
          .optional()
          .describe('Reaction count. Format: >10'),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Issue state. Default: all'),
        teamMentions: z.string().optional().describe('Team mentioned in issue'),
        updated: z
          .string()
          .optional()
          .describe('When updated. Format: >2020-01-01'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility'),
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
          .describe('Sort by activity or reactions. Default: best match'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order. Default: desc'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Results limit (1-50). Default: 25'),
      },
      annotations: {
        title: 'GitHub Issues Search - Bug & Feature Discovery',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubIssuesSearchParams): Promise<CallToolResult> => {
      if (!args.query?.trim()) {
        return createResult({
          error: `${ERROR_MESSAGES.QUERY_REQUIRED} ${SUGGESTIONS.PROVIDE_KEYWORDS}`,
        });
      }

      if (args.query.length > 256) {
        return createResult({
          error: ERROR_MESSAGES.QUERY_TOO_LONG,
        });
      }

      try {
        return await searchGitHubIssues(args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '';
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

        // Generic fallback
        return createResult({
          error: createSearchFailedError('issues'),
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
    const apiResponse = execResult.result;
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
        created_at: toDDMMYYYY(issue.created_at),
        updated_at: toDDMMYYYY(issue.updated_at),
        url: issue.html_url,
        comments: issue.comments,
        reactions: issue.reactions?.total_count || 0,
      })
    );

    const searchResult: GitHubIssuesSearchResult = {
      results: cleanIssues,
    };

    return createResult({ data: searchResult });
  });
}

function buildGitHubIssuesAPICommand(params: GitHubIssuesSearchParams): {
  command: GhCommand;
  args: string[];
} {
  const queryParts: string[] = [];

  // Start with the base query, but filter out qualifiers that will be added separately
  const baseQuery = params.query?.trim() || '';

  // Extract and remove qualifiers from the main query to avoid conflicts
  const qualifierPatterns = [
    /\bis:(open|closed)\b/gi,
    /\blabel:("[^"]*"|[^\s]+)/gi,
    /\bcreated:([^\s]+)/gi,
    /\bupdated:([^\s]+)/gi,
    /\bauthor:([^\s]+)/gi,
    /\bassignee:([^\s]+)/gi,
    /\bstate:(open|closed)/gi,
    /\brepo:([^\s]+)/gi,
    /\borg:([^\s]+)/gi,
  ];

  // Remove extracted qualifiers from base query
  let cleanQuery = baseQuery;
  qualifierPatterns.forEach(pattern => {
    cleanQuery = cleanQuery.replace(pattern, '').trim();
  });

  // Add the cleaned query if it has content
  if (cleanQuery) {
    queryParts.push(cleanQuery);
  }

  // Repository/organization qualifiers - prioritize function params over query
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`org:${params.owner}`);
  }

  // Build search qualifiers from function parameters (these take precedence)
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

  // Special qualifiers - handle labels carefully
  if (params.labels) {
    queryParts.push(`label:"${params.labels}"`);
  }
  if (params.milestone) queryParts.push(`milestone:"${params.milestone}"`);
  if (params.noAssignee) queryParts.push('no:assignee');
  if (params.noLabel) queryParts.push('no:label');
  if (params.noMilestone) queryParts.push('no:milestone');
  if (params.archived !== undefined)
    queryParts.push(`archived:${params.archived}`);
  if (params.locked) queryParts.push('is:locked');
  if (params.visibility) queryParts.push(`is:${params.visibility}`);

  // Extract qualifiers from original query and add them if not already set by params
  if (baseQuery.includes('is:') && !params.state) {
    const isMatch = baseQuery.match(/\bis:(open|closed)\b/i);
    if (isMatch && !queryParts.some(part => part.startsWith('state:'))) {
      queryParts.push(`state:${isMatch[1].toLowerCase()}`);
    }
  }

  if (baseQuery.includes('label:') && !params.labels) {
    const labelMatch = baseQuery.match(/\blabel:("[^"]*"|[^\s]+)/i);
    if (labelMatch) {
      const labelValue = labelMatch[1].replace(/"/g, '');
      queryParts.push(`label:"${labelValue}"`);
    }
  }

  if (baseQuery.includes('created:') && !params.created) {
    const createdMatch = baseQuery.match(/\bcreated:([^\s]+)/i);
    if (createdMatch) {
      queryParts.push(`created:${createdMatch[1]}`);
    }
  }

  const query = queryParts.filter(Boolean).join(' ');
  const limit = Math.min(params.limit || 25, 100);

  let apiPath = `search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`;
  if (params.sort) apiPath += `&sort=${params.sort}`;
  if (params.order) apiPath += `&order=${params.order}`;

  return { command: 'api', args: [apiPath] };
}
