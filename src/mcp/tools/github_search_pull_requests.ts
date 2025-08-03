import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubPullRequestsSearchParams } from '../../types';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  ERROR_MESSAGES,
  SUGGESTIONS,
  createSearchFailedError,
} from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';
import { searchGitHubPullRequestsAPI } from '../../utils/githubAPI';

const DESCRIPTION = `Search GitHub pull requests using the GitHub API with comprehensive filtering and analysis.

PERFORMANCE: getCommitData=true and withComments=true are token expensive`;

export function registerSearchGitHubPullRequestsTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    {
      description: DESCRIPTION,
      inputSchema: {
        // CORE SEARCH - Query is optional, you can search with filters only
        query: z
          .string()
          .optional()
          .describe(
            'Search query for PR content (optional - you can search using filters only). Examples: "fix bug", "update dependencies", "security patch"'
          ),

        // REPOSITORY FILTERS
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Repository owner - single owner or comma-separated list'),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Repository name - single repo or comma-separated list'),
        language: z.string().optional().describe('Programming language filter'),
        archived: z.boolean().optional().describe('Repository archived state'),
        visibility: z
          .union([
            z.enum(['public', 'private', 'internal']),
            z.array(z.enum(['public', 'private', 'internal'])),
          ])
          .optional()
          .describe(
            'Repository visibility - single value or comma-separated list: public,private,internal'
          ),

        // USER INVOLVEMENT FILTERS
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

        // BASIC STATE FILTERS
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('PR state: "open" or "closed"'),
        draft: z.boolean().optional().describe('Draft state'),
        merged: z.boolean().optional().describe('Merged state'),
        locked: z.boolean().optional().describe('Locked conversation status'),

        // BRANCH FILTERS
        head: z.string().optional().describe('Filter on head branch name'),
        base: z.string().optional().describe('Filter on base branch name'),

        // DATE FILTERS
        created: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
          )
          .optional()
          .describe(
            'Created date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'
          ),
        updated: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
          )
          .optional()
          .describe(
            'Updated date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'
          ),
        'merged-at': z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
          )
          .optional()
          .describe(
            'Merged date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'
          ),
        closed: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
          )
          .optional()
          .describe(
            'Closed date. Use ">2024-01-01", "2024-01-01..2024-12-31", etc.'
          ),

        // ENGAGEMENT FILTERS
        comments: z
          .union([
            z.number().int().min(0),
            z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
          ])
          .optional()
          .describe(
            'Comment count. Use ">10", ">=5", "<20", "5..10", or exact number'
          ),
        reactions: z
          .union([
            z.number().int().min(0),
            z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
          ])
          .optional()
          .describe(
            'Reaction count. Use ">100", ">=10", "<50", "10..50", or exact number'
          ),
        interactions: z
          .union([
            z.number().int().min(0),
            z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
          ])
          .optional()
          .describe(
            'Total interactions (reactions + comments). Use ">50", "10..100", etc.'
          ),

        // REVIEW & CI FILTERS
        review: z
          .enum(['none', 'required', 'approved', 'changes_requested'])
          .optional()
          .describe('Review status'),
        checks: z
          .enum(['pending', 'success', 'failure'])
          .optional()
          .describe('CI checks status'),

        // ORGANIZATION FILTERS
        app: z.string().optional().describe('GitHub App author'),
        'team-mentions': z
          .string()
          .optional()
          .describe('Team mentions (@org/team-name)'),
        label: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Labels. Single label or array for OR logic: ["bug", "feature"]'
          ),
        milestone: z.string().optional().describe('Milestone title'),
        project: z.string().optional().describe('Project board owner/number'),

        // BOOLEAN "MISSING" FILTERS
        'no-assignee': z.boolean().optional().describe('PRs without assignees'),
        'no-label': z.boolean().optional().describe('PRs without labels'),
        'no-milestone': z
          .boolean()
          .optional()
          .describe('PRs without milestones'),
        'no-project': z.boolean().optional().describe('PRs not in projects'),

        // SEARCH SCOPE
        match: z
          .array(z.enum(['title', 'body', 'comments']))
          .optional()
          .describe('Restrict search to specific fields'),

        // RESULT CONTROL
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
          .describe('Order of results, requires --sort'),

        // EXPENSIVE OPTIONS
        getCommitData: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Set to true to fetch all commits in the PR with their changes. Shows commit messages, authors, and file changes. WARNING: EXTREMELY expensive in tokens - fetches diff/patch content for each commit.'
          ),
        withComments: z
          .boolean()
          .default(false)
          .describe(
            'Include full comment content in search results. WARNING: EXTREMELY expensive in tokens and should be used with caution. Recommended to not use unless specifically needed.'
          ),
      },
      annotations: {
        title: 'GitHub PR Search - API Only',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubPullRequestsSearchParams): Promise<CallToolResult> => {
        // Query is optional - you can search using filters only
        if (
          args.query !== undefined &&
          (!args.query?.trim() || args.query.length > 256)
        ) {
          const hints = generateSmartHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              errorMessage:
                args.query?.length > 256 ? 'Query too long' : 'Query required',
              customHints: [
                'Use shorter search terms',
                'Try filter-only search without query',
              ],
            }
          );
          return createResult({
            error:
              args.query?.length > 256
                ? ERROR_MESSAGES.QUERY_TOO_LONG
                : `${ERROR_MESSAGES.QUERY_REQUIRED} ${SUGGESTIONS.PROVIDE_PR_KEYWORDS}`,
            hints,
          });
        }

        // If no query is provided, ensure at least some filters are present
        if (!args.query?.trim()) {
          if (!hasAnyFilters(args)) {
            const hints = generateSmartHints(
              TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
              {
                hasResults: false,
                errorMessage: 'No search criteria provided',
                customHints: [
                  'Add search query OR filters',
                  'Try specific repo: --owner owner --repo repo',
                ],
              }
            );
            return createResult({
              error: `No search query or filters provided. Either provide a query (e.g., "fix bug") or use filters (e.g., --repo owner/repo --state open).`,
              hints,
            });
          }
        }

        try {
          const result = await searchGitHubPullRequestsAPI(args, opts.ghToken);

          // Check if result is an error
          if ('error' in result) {
            const hints = generateSmartHints(
              TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
              {
                hasResults: false,
                errorMessage: result.error,
                customHints: result.hints || [],
              }
            );
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - return raw data wrapped for MCP
          const hints = generateSmartHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: result.pull_requests.length > 0,
              totalItems: result.pull_requests.length,
            }
          );

          return createResult({
            data: {
              ...result,
              apiSource: true,
            },
            hints,
          });
        } catch (error) {
          const hints = generateSmartHints(
            TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
            {
              hasResults: false,
              errorMessage: 'Search failed',
            }
          );
          return createResult({
            error: createSearchFailedError('pull_requests'),
            hints,
          });
        }
      }
    )
  );
}

/**
 * Helper function to check if any search filters are provided
 * Avoids long conditional checks in validation
 */
function hasAnyFilters(params: GitHubPullRequestsSearchParams): boolean {
  // Core filters
  if (params.owner || params.repo || params.language || params.state)
    return true;

  // User filters
  if (
    params.author ||
    params.assignee ||
    params.mentions ||
    params.commenter ||
    params.involves ||
    params['reviewed-by'] ||
    params['review-requested']
  )
    return true;

  // Date filters
  if (params.created || params.updated || params['merged-at'] || params.closed)
    return true;

  // Engagement filters
  if (
    params.comments !== undefined ||
    params.reactions !== undefined ||
    params.interactions !== undefined
  )
    return true;

  // Branch and metadata filters
  if (
    params.head ||
    params.base ||
    params.label ||
    params.milestone ||
    params.project ||
    params.app ||
    params['team-mentions']
  )
    return true;

  // Boolean state filters
  if (
    params.draft !== undefined ||
    params.merged !== undefined ||
    params.locked !== undefined ||
    params.archived !== undefined
  )
    return true;

  // Missing attribute filters
  if (
    params['no-assignee'] ||
    params['no-label'] ||
    params['no-milestone'] ||
    params['no-project']
  )
    return true;

  // Other filters
  if (params.visibility || params.review || params.checks || params.match)
    return true;

  return false;
}
