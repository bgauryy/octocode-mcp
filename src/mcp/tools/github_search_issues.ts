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

const DESCRIPTION = `Search GitHub issues for bug reports, feature requests, and discussions. Find issues by keywords, state, labels, author, or repository. Returns issue number, title, state, labels, and metadata for effective issue tracking and analysis.`;

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
            'Repository owner/organization name only (e.g., "facebook", "microsoft"). Do NOT include repository name. Must be used with repo parameter for repository-specific searches.'
          ),
        repo: z
          .string()
          .optional()
          .describe(
            'Repository name only (e.g., "react", "vscode"). Do NOT include owner prefix. Must be used together with owner parameter.'
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
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "<=2023-12-31", "2020-01-01..2023-12-31", or exact date "2023-01-01"'
          )
          .optional()
          .describe(
            'When closed. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "2020-01-01..2023-12-31" (range)'
          ),
        commenter: z
          .string()
          .optional()
          .describe('User who commented on issue'),
        comments: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">10", ">=5", "<20", "<=15", "5..20", or exact number "10"'
              ),
          ])
          .optional()
          .describe(
            'Comment count filter. Format: ">10" (many comments), ">=5" (at least 5), "<5" (few comments), "5..10" (range), "10" (exact)'
          ),
        created: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "<=2023-12-31", "2020-01-01..2023-12-31", or exact date "2023-01-01"'
          )
          .optional()
          .describe(
            'When created. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "2020-01-01..2023-12-31" (range)'
          ),
        'include-prs': z
          .boolean()
          .optional()
          .describe('Include pull requests. Default: false'),
        interactions: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">100", ">=50", "<200", "<=150", "50..200", or exact number "100"'
              ),
          ])
          .optional()
          .describe(
            'Total interactions (reactions + comments) filter. Format: ">100" (highly engaged), ">=50" (moderately engaged), "<20" (low engagement), "50..200" (range)'
          ),
        involves: z.string().optional().describe('User involved in any way'),
        label: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Label names. Can be single string or array.'),
        language: z.string().optional().describe('Repository language'),
        locked: z.boolean().optional().describe('Conversation locked status'),
        match: z
          .enum(['title', 'body', 'comments'])
          .optional()
          .describe('Search scope. Default: title and body'),
        mentions: z.string().optional().describe('Issues mentioning this user'),
        milestone: z.string().optional().describe('Milestone name'),
        'no-assignee': z
          .boolean()
          .optional()
          .describe('Issues without assignee'),
        'no-label': z.boolean().optional().describe('Issues without labels'),
        'no-milestone': z
          .boolean()
          .optional()
          .describe('Issues without milestone'),
        'no-project': z.boolean().optional().describe('Issues not in projects'),
        project: z.string().optional().describe('Project board number'),
        reactions: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">10", ">=5", "<50", "<=25", "5..50", or exact number "10"'
              ),
          ])
          .optional()
          .describe(
            'Reaction count filter. Format: ">10" (popular), ">=5" (some reactions), "<50" (moderate), "5..50" (range), "10" (exact)'
          ),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Issue state. Default: all'),
        'team-mentions': z
          .string()
          .optional()
          .describe('Team mentioned in issue (@org/team-name)'),
        updated: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "<=2023-12-31", "2020-01-01..2023-12-31", or exact date "2023-01-01"'
          )
          .optional()
          .describe(
            'When updated. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "2020-01-01..2023-12-31" (range)'
          ),
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
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => queryParts.push(`label:"${label}"`));
  }
  if (params.milestone) queryParts.push(`milestone:"${params.milestone}"`);
  if (params['no-assignee']) queryParts.push('no:assignee');
  if (params['no-label']) queryParts.push('no:label');
  if (params['no-milestone']) queryParts.push('no:milestone');
  if (params['no-project']) queryParts.push('no:project');
  if (params.archived !== undefined)
    queryParts.push(`archived:${params.archived}`);
  if (params.locked) queryParts.push('is:locked');
  if (params.visibility) queryParts.push(`is:${params.visibility}`);
  if (params['include-prs']) queryParts.push('is:pr');
  if (params['team-mentions'])
    queryParts.push(`team:${params['team-mentions']}`);
  if (params.project) queryParts.push(`project:${params.project}`);
  if (params.app) queryParts.push(`app:${params.app}`);
  if (params.comments) queryParts.push(`comments:${params.comments}`);
  if (params.interactions)
    queryParts.push(`interactions:${params.interactions}`);
  if (params.reactions) queryParts.push(`reactions:${params.reactions}`);

  // Extract qualifiers from original query and add them if not already set by params
  if (baseQuery.includes('is:') && !params.state) {
    const isMatch = baseQuery.match(/\bis:(open|closed)\b/i);
    if (isMatch && !queryParts.some(part => part.startsWith('state:'))) {
      queryParts.push(`state:${isMatch[1].toLowerCase()}`);
    }
  }

  if (baseQuery.includes('label:') && !params.label) {
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
