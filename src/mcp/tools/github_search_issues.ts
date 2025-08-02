import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubIssuesSearchParams } from '../../types';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createSearchFailedError } from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';
import { searchGitHubIssuesAPI } from '../../utils/githubAPI';

const DESCRIPTION = `Search GitHub issues using the GitHub API with comprehensive filtering and analysis.

PERFORMANCE: match=body and match=comments are EXTREMELY expensive in tokens as they include full issue content and all comments.

INTEGRATION WORKFLOW:
- Repository-specific searches return commit SHAs (head_sha, base_sha) for direct use with github fetch content (branch=SHA)
- Use issue/PR numbers with github_fetch_content to view specific content
- Perfect for analyzing bug reports and feature requests

SEARCH STRATEGY FOR BEST RESULTS:

EXACT vs TERMS (Choose ONE):
- query: Use for exact phrase matching or minimal words for broader coverage

TERM OPTIMIZATION:
- BEST: Single terms for maximum coverage
- GOOD: 2-3 minimal terms 
- AVOID: Long phrases

MULTI-SEARCH STRATEGY:
- Use separate searches for different aspects
- Separate searches provide broader coverage than complex queries

Filter Usage:
- Use filters to narrow scope: state, labels, author, repository
- Combine filters strategically: owner + repo for repository-specific searches
- Never use filters on exploratory searches - use to refine results`;

export function registerSearchGitHubIssuesTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_ISSUES,
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
          .describe(
            'Search scope. Default: title and body. WARNING: "body" and "comments" are EXTREMELY expensive in tokens as they include full issue content and all comments.'
          ),
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
    withSecurityValidation(
      async (args: GitHubIssuesSearchParams): Promise<CallToolResult> => {
        if (!args.query?.trim()) {
          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
            hasResults: false,
            totalItems: 0,
            errorMessage: 'Search query is required',
            customHints: ['Provide keywords like "bug", "error", "feature"'],
          });

          return createResult({
            isError: true,
            error: 'Search query is required and cannot be empty',
            hints,
          });
        }

        if (args.query.length > 256) {
          return createResult({
            isError: true,
            error: 'Query too long. Please use a shorter search query.',
          });
        }

        try {
          return await searchGitHubIssuesAPI(args, opts.ghToken);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '';

          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_ISSUES, {
            hasResults: false,
            totalItems: 0,
            errorMessage: `Issue search failed: ${errorMessage}`,
            customHints: [
              'Check if repository exists and is accessible',
              'Verify search parameters are valid',
              'Try simpler search terms',
            ],
          });

          return createResult({
            isError: true,
            error: createSearchFailedError('issues'),
            hints,
          });
        }
      }
    )
  );
}
