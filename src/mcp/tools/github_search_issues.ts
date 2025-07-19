import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubIssuesSearchParams,
  GitHubIssuesSearchResult,
  GitHubIssueItem,
  BasicGitHubIssue,
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
import { validateSearchToolInput } from '../../security/searchToolSanitizer';

export const GITHUB_SEARCH_ISSUES_TOOL_NAME = 'githubSearchIssues';

const DESCRIPTION = `Search GitHub issues for bug reports, feature requests, and discussions. Find issues by keywords, state, labels, author, or repository. Returns issue details including body content for effective issue tracking and analysis.

TOKEN OPTIMIZATION
- Issue body content is expensive in tokens. Use only when necessary.
- Use specific queries and filters to reduce result count`;

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
    async (args: GitHubIssuesSearchParams): Promise<CallToolResult> => {
      // Validate input parameters for security
      const securityCheck = validateSearchToolInput(args);
      if (!securityCheck.isValid) {
        return securityCheck.error!;
      }
      const sanitizedArgs = securityCheck.sanitizedArgs;

      if (!sanitizedArgs.query?.trim()) {
        return createResult({
          error: `${ERROR_MESSAGES.QUERY_REQUIRED} ${SUGGESTIONS.PROVIDE_KEYWORDS}`,
        });
      }

      if (sanitizedArgs.query.length > 256) {
        return createResult({
          error: ERROR_MESSAGES.QUERY_TOO_LONG,
        });
      }

      try {
        return await searchGitHubIssues(
          sanitizedArgs as GitHubIssuesSearchParams
        );
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
    const issues = Array.isArray(apiResponse)
      ? apiResponse
      : apiResponse.items || [];

    // First map basic issue data
    const basicIssues: BasicGitHubIssue[] = issues.map((issue: any) => {
      // Handle direct JSON format from gh CLI
      const repoName =
        issue.repository?.nameWithOwner ||
        issue.repository?.full_name ||
        'unknown';
      const repo = repoName.includes('/') ? repoName.split('/')[1] : repoName;

      return {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author:
          typeof issue.author === 'string'
            ? { login: issue.author }
            : {
                login: issue.author?.login || '',
                id: issue.author?.id,
                url: issue.author?.url,
                type: issue.author?.type,
                is_bot: issue.author?.is_bot,
              },
        repository: {
          name: repo,
          nameWithOwner: repoName,
        },
        labels:
          issue.labels?.map((l: any) =>
            typeof l === 'string'
              ? { name: l }
              : {
                  name: l.name,
                  color: l.color,
                  description: l.description,
                  id: l.id,
                }
          ) || [],
        createdAt: issue.createdAt || issue.created_at,
        updatedAt: issue.updatedAt || issue.updated_at,
        url: issue.url || issue.html_url,
        commentsCount: issue.commentsCount ?? issue.comments ?? 0,
        reactions: issue.reactions?.total_count || 0,
        // Legacy compatibility fields
        created_at: toDDMMYYYY(issue.createdAt || issue.created_at),
        updated_at: toDDMMYYYY(issue.updatedAt || issue.updated_at),
      };
    });

    // Fetch detailed issue information in parallel
    const cleanIssues: GitHubIssueItem[] = await Promise.all(
      basicIssues.map(
        async (issue: BasicGitHubIssue): Promise<GitHubIssueItem> => {
          try {
            const { nameWithOwner } = issue.repository;
            const [owner, repo] = nameWithOwner.split('/');

            // Fetch issue details using gh issue view
            const viewResult = await executeGitHubCommand(
              'api' as GhCommand,
              [`/repos/${owner}/${repo}/issues/${issue.number}`],
              { cache: false }
            );

            if (!viewResult.isError) {
              const execResult = JSON.parse(
                viewResult.content[0].text as string
              );
              const issueDetails = execResult.result;

              return {
                ...issue,
                body: issueDetails.body || '',
                assignees:
                  issueDetails.assignees?.map((a: any) => ({
                    login: a.login,
                    id: a.id?.toString(),
                    url: a.html_url,
                    type: a.type,
                    is_bot: a.type === 'Bot',
                  })) || [],
                authorAssociation: issueDetails.author_association,
                closedAt: issueDetails.closed_at,
                isLocked: issueDetails.locked,
                // Update with full author info
                author: issueDetails.user
                  ? {
                      login: issueDetails.user.login,
                      id: issueDetails.user.id?.toString(),
                      url: issueDetails.user.html_url,
                      type: issueDetails.user.type,
                      is_bot: issueDetails.user.type === 'Bot',
                    }
                  : issue.author,
                // Update labels with full info
                labels:
                  issueDetails.labels?.map((l: any) => ({
                    name: l.name,
                    color: l.color,
                    description: l.description,
                    id: l.id?.toString(),
                  })) || issue.labels,
                createdAt: issueDetails.created_at,
                updatedAt: issueDetails.updated_at,
                id: issueDetails.id?.toString(),
                isPullRequest: issueDetails.pull_request !== undefined,
                commentsCount: issueDetails.comments,
                closed_at: issueDetails.closed_at
                  ? toDDMMYYYY(issueDetails.closed_at)
                  : undefined,
              } as GitHubIssueItem;
            }

            // If fetching details fails, return basic info with empty body
            return { ...issue, body: '' } as GitHubIssueItem;
          } catch (error) {
            // If any error occurs, return basic info with empty body
            return { ...issue, body: '' } as GitHubIssueItem;
          }
        }
      )
    );

    // Smart fallback suggestions for no results
    if (cleanIssues.length === 0) {
      const fallbackSuggestions = [];

      // Analyze search parameters for specific suggestions
      if (params.state === 'closed') {
        fallbackSuggestions.push('• Try state:open or remove state filter');
      }

      if (params.author) {
        fallbackSuggestions.push('• Remove author filter for broader search');
        fallbackSuggestions.push(
          `• Use github_search_code to find ${params.author}'s contributions`
        );
      }

      if (params.label) {
        const labels = Array.isArray(params.label)
          ? params.label
          : [params.label];
        fallbackSuggestions.push(`• Try broader labels or remove label filter`);
        fallbackSuggestions.push(
          `• Search for label variations: ${labels.map(l => `"${l}"`).join(', ')}`
        );
      }

      if (params.owner && params.repo) {
        fallbackSuggestions.push('• Check repository name spelling');
        fallbackSuggestions.push(
          '• Use github_view_repo_structure to verify repository exists'
        );
      } else if (params.owner) {
        fallbackSuggestions.push('• Remove owner filter for global search');
        fallbackSuggestions.push(
          '• Use github_search_repos to find organization repositories'
        );
      }

      if (params.created || params.updated) {
        fallbackSuggestions.push('• Expand date range or remove date filters');
      }

      // Add general alternatives
      fallbackSuggestions.push('• Try broader search terms');
      fallbackSuggestions.push(
        '• Use github_search_pull_requests for related development activity'
      );
      fallbackSuggestions.push(
        '• Use github_search_code to find implementation patterns'
      );

      return createResult({
        error: `No issues found for query: "${params.query}"

Try these alternatives:
${fallbackSuggestions.join('\n')}

Discovery strategies:
• Broader terms: "error" instead of "TypeError"
• Remove filters: state, labels, author
• Related searches: pull requests, code implementations`,
      });
    }

    const searchResult: GitHubIssuesSearchResult = {
      results: cleanIssues,
    };

    return createResult({ data: searchResult });
  });
}

export function buildGitHubIssuesAPICommand(params: GitHubIssuesSearchParams): {
  command: GhCommand;
  args: string[];
} {
  const args = ['issues'];

  // Add the search query first if provided
  if (params.query?.trim()) {
    args.push(params.query.trim());
  }

  // Add CLI flags (not search qualifiers)
  if (params.app) args.push('--app', params.app);
  if (params.archived !== undefined)
    args.push('--archived', params.archived.toString());
  if (params.assignee) args.push('--assignee', params.assignee);
  if (params.author) args.push('--author', params.author);
  if (params.closed) args.push('--closed', params.closed);
  if (params.commenter) args.push('--commenter', params.commenter);
  if (params.comments) args.push('--comments', params.comments.toString());
  if (params.created) args.push('--created', params.created);
  if (params['include-prs']) args.push('--include-prs');
  if (params.interactions)
    args.push('--interactions', params.interactions.toString());
  if (params.involves) args.push('--involves', params.involves);

  // Handle labels
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    args.push('--label', labels.join(','));
  }

  if (params.language) args.push('--language', params.language);
  if (params.locked) args.push('--locked');

  // Handle match
  if (params.match) {
    args.push('--match', params.match);
  }

  if (params.mentions) args.push('--mentions', params.mentions);
  if (params.milestone) args.push('--milestone', params.milestone);
  if (params['no-assignee']) args.push('--no-assignee');
  if (params['no-label']) args.push('--no-label');
  if (params['no-milestone']) args.push('--no-milestone');
  if (params['no-project']) args.push('--no-project');

  // Handle owner/repo
  if (params.owner && params.repo) {
    args.push('--repo', `${params.owner}/${params.repo}`);
  } else if (params.owner) {
    args.push('--owner', params.owner);
  }

  if (params.project) args.push('--project', params.project);
  if (params.reactions) args.push('--reactions', params.reactions.toString());
  if (params.state) args.push('--state', params.state);
  if (params['team-mentions'])
    args.push('--team-mentions', params['team-mentions']);
  if (params.updated) args.push('--updated', params.updated);
  if (params.visibility) args.push('--visibility', params.visibility);

  // Sort and order
  if (params.sort) {
    args.push('--sort', params.sort);
  }
  if (params.order) {
    args.push('--order', params.order);
  }

  // Limit
  const limit = Math.min(params.limit || 25, 100);
  args.push('--limit', limit.toString());

  // JSON output - note: body is not included in search results, we fetch it separately
  args.push(
    '--json',
    'assignees,author,authorAssociation,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url'
  );

  return { command: 'search', args };
}
