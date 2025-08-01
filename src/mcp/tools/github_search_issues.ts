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
import { withSecurityValidation } from './utils/withSecurityValidation';
import { GitHubIssuesSearchBuilder } from './utils/GitHubCommandBuilder';
import { ContentSanitizer } from '../../security/contentSanitizer';
import {
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  ToolOptions,
} from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';
import { searchGitHubIssuesAPI } from '../../utils/githubAPI';
import { processDualResults, dataExtractors } from './utils/resultProcessor';

const DESCRIPTION = `PURPOSE: Search GitHub issues for bugs, features, and discussions.

USAGE:
 Find bug reports and feature requests
 Track issue discussions
 Analyze project problems

PHILOSOPHY: Get quality data from relevant sources`;

export function registerSearchGitHubIssuesTool(
  server: McpServer,
  opts: ToolOptions = { githubAPIType: 'both', npmEnabled: false }
) {
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
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s) (e.g., "facebook", ["microsoft", "google"]). Do NOT include repository name. Must be used with repo parameter for repository-specific searches.'
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
          return await searchIssuesWithDualSupport(args, opts);
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
    )
  );
}

/**
 * Build custom hints based on search parameters for better LLM guidance
 */
function buildCustomHints(args: GitHubIssuesSearchParams): string[] {
  const customHints: string[] = [];

  // Add parameter-specific hints
  if (args.state === 'closed') {
    customHints.push('Try state:open or remove state filter');
  }
  if (args.author) {
    customHints.push('Remove author filter for broader search');
  }
  if (args.label) {
    customHints.push('Try broader labels or remove label filter');
  }
  if (args.owner && args.repo) {
    customHints.push('Check repository name spelling');
  }
  if (args.created || args.updated) {
    customHints.push('Expand date range or remove date filters');
  }

  return customHints;
}

/**
 * Search issues with dual CLI/API support using standardized result processing
 */
async function searchIssuesWithDualSupport(
  args: GitHubIssuesSearchParams,
  opts: ToolOptions
): Promise<CallToolResult> {
  // Execute searches based on apiType option
  let cliResult: CallToolResult | null = null;
  let apiResult: CallToolResult | null = null;

  if (opts.githubAPIType === 'gh' || opts.githubAPIType === 'both') {
    // Execute CLI search
    cliResult = await searchGitHubIssues(args);
  }

  if (opts.githubAPIType === 'octokit' || opts.githubAPIType === 'both') {
    // Execute API search
    apiResult = await searchGitHubIssuesAPI(args, opts.ghToken);
  }

  // Process both results using standardized processor
  const dualResult = await processDualResults(cliResult, apiResult, {
    cliDataExtractor: dataExtractors.resultsArray,
    apiDataExtractor: dataExtractors.resultsArray,
    preferredSource: 'cli',
  });

  // Handle case where no results were found
  if (!dualResult.bestResult || !dualResult.bestResult.data) {
    const hints = generateSmartHints(GITHUB_SEARCH_ISSUES_TOOL_NAME, {
      hasResults: false,
      totalItems: 0,
      errorMessage: `No issues found for query: "${args.query}"`,
      customHints: buildCustomHints(args),
    });

    return createResult({
      error: `No issues found for query: "${args.query}"`,
      hints,
    });
  }

  const finalResult: GitHubIssuesSearchResult = {
    results: dualResult.bestResult.data.results || [],
  };

  // Generate smart hints for successful results
  const hints = generateSmartHints(GITHUB_SEARCH_ISSUES_TOOL_NAME, {
    hasResults: true,
    totalItems: finalResult.results.length,
    customHints: buildCustomHints(args),
  });

  // Add source information and dual results if verbose
  const responseData = {
    ...finalResult,
    hints,
    resultSource: dualResult.resultSource,
    dualResults:
      opts.githubAPIType === 'both'
        ? {
            cli: {
              issues: dualResult.cli.data?.results?.length || 0,
              error: dualResult.cli.error,
            },
            api: {
              issues: dualResult.api.data?.results?.length || 0,
              error: dualResult.api.error,
            },
          }
        : undefined,
  };

  return createResult({
    data: responseData,
  });
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

      // Sanitize issue title
      const titleSanitized = ContentSanitizer.sanitizeContent(
        issue.title || ''
      );

      const basicIssue: BasicGitHubIssue = {
        number: issue.number,
        title: titleSanitized.content,
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

      // Add sanitization warnings if any were detected for title
      if (titleSanitized.warnings.length > 0) {
        basicIssue._sanitization_warnings = titleSanitized.warnings;
      }

      return basicIssue;
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

              // Sanitize issue body content
              const bodySanitized = ContentSanitizer.sanitizeContent(
                issueDetails.body || ''
              );

              const result: GitHubIssueItem = {
                ...issue,
                body: bodySanitized.content,
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
              };

              // Add sanitization warnings if any were detected (merge with existing title warnings)
              const allWarningsSet = new Set<string>([
                ...(issue._sanitization_warnings || []),
                ...bodySanitized.warnings,
              ]);
              if (allWarningsSet.size > 0) {
                result._sanitization_warnings = Array.from(allWarningsSet);
              }

              return result;
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

    // Generate smart research hints for no results
    if (cleanIssues.length === 0) {
      const customHints = [];

      // Add parameter-specific hints
      if (params.state === 'closed') {
        customHints.push('Try state:open or remove state filter');
      }
      if (params.author) {
        customHints.push('Remove author filter for broader search');
      }
      if (params.label) {
        customHints.push('Try broader labels or remove label filter');
      }
      if (params.owner && params.repo) {
        customHints.push('Check repository name spelling');
      }
      if (params.created || params.updated) {
        customHints.push('Expand date range or remove date filters');
      }

      const hints = generateSmartHints(GITHUB_SEARCH_ISSUES_TOOL_NAME, {
        hasResults: false,
        totalItems: 0,
        customHints,
      });

      return createResult({
        error: `No issues found for query: "${params.query}"`,
        hints,
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
  const builder = new GitHubIssuesSearchBuilder();
  return { command: 'search', args: builder.build(params) };
}
