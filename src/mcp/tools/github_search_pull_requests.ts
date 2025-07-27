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
import { withSecurityValidation } from './utils/withSecurityValidation';
import { minifyContentV2 } from '../../utils/minifier';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME } from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';

// TODO: summerize body

const DESCRIPTION = `Search GitHub pull requests with comprehensive filtering and analysis.

PERFORMANCE: getCommitData=true and withComments=true are token expensive`;

export function registerSearchGitHubPullRequestsTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
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

        // REPOSITORY FILTERS - Direct CLI flag mappings
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner - single owner or comma-separated list. Multi-owner searches have limited practical use (--owner)'
          ),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository name - single repo or comma-separated list. Multi-repo searches work best with single owner (--repo)'
          ),
        language: z
          .string()
          .optional()
          .describe('Programming language filter (--language)'),
        archived: z.boolean().optional().describe('Repository archived state'),
        visibility: z
          .union([
            z.enum(['public', 'private', 'internal']),
            z.array(z.enum(['public', 'private', 'internal'])),
          ])
          .optional()
          .describe(
            'Repository visibility - single value or comma-separated list: public,private,internal (--visibility)'
          ),

        // USER INVOLVEMENT FILTERS - Direct CLI flag mappings
        author: z
          .string()
          .optional()
          .describe('GitHub username of PR author (--author)'),
        assignee: z
          .string()
          .optional()
          .describe('GitHub username of assignee (--assignee)'),
        mentions: z
          .string()
          .optional()
          .describe('PRs mentioning this user (--mentions)'),
        commenter: z
          .string()
          .optional()
          .describe('User who commented on PR (--commenter)'),
        involves: z
          .string()
          .optional()
          .describe('User involved in any way (--involves)'),
        'reviewed-by': z
          .string()
          .optional()
          .describe('User who reviewed the PR (--reviewed-by)'),
        'review-requested': z
          .string()
          .optional()
          .describe('User/team requested for review (--review-requested)'),

        // BASIC STATE FILTERS - Direct CLI flag mappings
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('PR state: "open" or "closed"'),
        draft: z.boolean().optional().describe('Draft state'),
        merged: z.boolean().optional().describe('Merged state'),
        locked: z.boolean().optional().describe('Locked conversation status'),

        // BRANCH FILTERS - Direct CLI flag mappings
        head: z
          .string()
          .optional()
          .describe('Filter on head branch name (--head)'),
        base: z
          .string()
          .optional()
          .describe('Filter on base branch name (--base)'),

        // DATE FILTERS - Direct CLI flag mappings with operator support
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

        // ENGAGEMENT FILTERS - Direct CLI flag mappings with operator support
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

        // REVIEW & CI FILTERS - Direct CLI flag mappings
        review: z
          .enum(['none', 'required', 'approved', 'changes_requested'])
          .optional()
          .describe('Review status'),
        checks: z
          .enum(['pending', 'success', 'failure'])
          .optional()
          .describe('CI checks status'),

        // ORGANIZATION FILTERS - Direct CLI flag mappings
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
        milestone: z
          .string()
          .optional()
          .describe('Milestone title (--milestone)'),
        project: z
          .string()
          .optional()
          .describe('Project board owner/number (--project)'),

        // BOOLEAN "MISSING" FILTERS - Direct CLI flag mappings
        'no-assignee': z.boolean().optional().describe('PRs without assignees'),
        'no-label': z.boolean().optional().describe('PRs without labels'),
        'no-milestone': z
          .boolean()
          .optional()
          .describe('PRs without milestones'),
        'no-project': z.boolean().optional().describe('PRs not in projects'),

        // SEARCH SCOPE - Direct CLI flag mappings
        match: z
          .array(z.enum(['title', 'body', 'comments']))
          .optional()
          .describe('Restrict search to specific fields (--match)'),

        // RESULT CONTROL - Direct CLI flag mappings
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Maximum number of results to fetch (--limit)'),
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
          .describe('Sort fetched results (--sort)'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Order of results, requires --sort (--order)'),

        // EXPENSIVE OPTIONS - Custom functionality
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
        title: 'GitHub PR Search - Smart & Effective',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubPullRequestsSearchParams): Promise<CallToolResult> => {
        // Query is now optional - you can search using filters only
        if (
          args.query !== undefined &&
          (!args.query?.trim() || args.query.length > 256)
        ) {
          const hints = generateSmartHints(
            GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
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
              GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
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

        // Validate array parameter usage and warn about potential issues
        const validationWarnings = validateParameterCombinations(args);
        if (validationWarnings.length > 0) {
          // Log warnings but don't fail - let the user proceed with caveats
          // eslint-disable-next-line no-console
          console.warn(
            'Parameter combination warnings:',
            validationWarnings.join('; ')
          );
        }

        try {
          return await searchGitHubPullRequests(args);
        } catch (error) {
          const hints = generateSmartHints(
            GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
            {
              hasResults: false,
              errorMessage: 'Search failed',
              customHints: ['Check authentication', 'Verify repository access'],
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

async function searchGitHubPullRequests(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-prs', params);

  return withCache(cacheKey, async () => {
    // Handle both string and array parameters throughout the function
    const primaryOwner = Array.isArray(params.owner)
      ? params.owner[0]
      : params.owner;
    const primaryRepo = Array.isArray(params.repo)
      ? params.repo[0]
      : params.repo;

    const { command, args } = buildGitHubPullRequestsAPICommand(params);
    const result = await executeGitHubCommand(command, args, { cache: false });

    if (result.isError) {
      const errorMsg = result.content[0].text as string;

      // Enhanced error handling for repository-specific searches

      if (primaryOwner && primaryRepo) {
        // Handle 404 errors with repository and branch checking
        if (errorMsg.includes('404')) {
          // Single repository check to avoid duplicate API calls
          const repoCheckResult = await executeGitHubCommand(
            'api',
            [`/repos/${primaryOwner}/${primaryRepo}`],
            { cache: false }
          );

          if (repoCheckResult.isError) {
            // Repository doesn't exist
            const hints = generateSmartHints(
              GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
              {
                hasResults: false,
                errorMessage: 'Repository not found',
                customHints: [
                  'Search repositories first',
                  'Check repository name spelling',
                ],
              }
            );
            return createResult({
              error: `Repository "${primaryOwner}/${primaryRepo}" not found.`,
              hints,
            });
          }

          // Repository exists, check if it's a branch-related error
          if (params.head || params.base) {
            try {
              const repoData = JSON.parse(
                repoCheckResult.content[0].text as string
              );
              const defaultBranch = repoData.result?.default_branch || 'main';

              let branchSuggestion = '';
              if (params.head && params.head !== defaultBranch) {
                branchSuggestion = `\n\nNote: Branch "${params.head}" may not exist. Repository default branch is "${defaultBranch}".`;
                branchSuggestion += `\nTry searching without head branch filter or use head="${defaultBranch}".`;
              }
              if (params.base && params.base !== defaultBranch) {
                branchSuggestion += `\n\nNote: Branch "${params.base}" may not exist. Repository default branch is "${defaultBranch}".`;
                branchSuggestion += `\nTry searching without base branch filter or use base="${defaultBranch}".`;
              }

              if (branchSuggestion) {
                const hints = generateSmartHints(
                  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
                  {
                    hasResults: false,
                    errorMessage: 'Branch not found',
                    customHints: [
                      `Use default branch: ${defaultBranch}`,
                      'Remove branch filters',
                    ],
                  }
                );
                return createResult({
                  error:
                    createNoResultsError('pull_requests') + branchSuggestion,
                  hints,
                });
              }
            } catch (e) {
              // Continue with original error if parsing fails
            }
          }
        }

        // Handle rate limit errors
        if (
          errorMsg.includes('rate limit') ||
          errorMsg.includes('API rate limit')
        ) {
          const hints = generateSmartHints(
            GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
            {
              hasResults: false,
              errorMessage: 'Rate limit exceeded',
              customHints: ['Wait 5-10 minutes', 'Use more specific filters'],
            }
          );
          return createResult({
            error: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            hints,
          });
        }
      }

      return result;
    }

    const execResult = JSON.parse(result.content[0].text as string);

    // Determine command type based on parameters (already decided in buildGitHubPullRequestsAPICommand)
    const isListCommand = command === 'pr' && args.includes('list');
    const isSearchCommand = command === 'search' && args.includes('prs');

    // Both commands return results in execResult.result array
    const pullRequests = Array.isArray(execResult.result)
      ? execResult.result
      : [];

    if (pullRequests.length === 0) {
      // Generate contextual custom hints based on current search
      const customHints: string[] = [];

      // Query-related suggestions
      if (params.query && params.query.trim().split(' ').length > 2) {
        customHints.push('Simplify search terms');
      }
      if (!params.query) {
        customHints.push('Add search terms: "fix", "feature", "bug"');
      }

      // Filter-related suggestions
      const activeFilters = [];
      if (params.owner && params.repo) activeFilters.push('repo');
      if (params.author) activeFilters.push('author');
      if (params.state) activeFilters.push('state');
      if (params.label) activeFilters.push('label');
      if (params.head) activeFilters.push('head-branch');
      if (params.base) activeFilters.push('base-branch');

      if (activeFilters.length > 2) {
        customHints.push('Remove some filters to broaden search');
      } else if (!params.owner && !params.repo) {
        customHints.push('Try specific repository: --owner --repo');
      }

      // State-specific suggestions
      if (!params.state) {
        customHints.push('Try --state open or --state closed');
      }

      const hints = generateSmartHints(GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME, {
        hasResults: false,
        errorMessage: 'No pull requests found',
        customHints,
      });

      return createResult({
        error: createNoResultsError('pull_requests'),
        hints,
      });
    }

    const cleanPRs: GitHubPullRequestItem[] = await Promise.all(
      pullRequests.map(async (pr: any) => {
        // Handle gh pr list format (repository-specific searches)
        if (isListCommand) {
          // Sanitize title and body content
          const titleSanitized = await minifyAndSanitizeTextContent(
            pr.title || ''
          );
          const bodySanitized = pr.body
            ? await minifyAndSanitizeTextContent(pr.body)
            : { content: undefined, warnings: [] };

          // Collect all sanitization warnings
          const sanitizationWarnings = [
            ...titleSanitized.warnings,
            ...bodySanitized.warnings,
          ];

          const result: GitHubPullRequestItem = {
            number: pr.number,
            title: titleSanitized.content,
            body: bodySanitized.content,
            state: pr.state?.toLowerCase() || 'unknown',
            author: pr.author?.login || '',
            repository: `${primaryOwner}/${primaryRepo}`,
            labels: pr.labels?.map((l: any) => l.name) || [],
            created_at: toDDMMYYYY(pr.createdAt),
            updated_at: toDDMMYYYY(pr.updatedAt),
            url: pr.url,
            comments: pr.comments || [], // Will be filtered based on withComments parameter
            reactions: 0, // Not available in list format
            draft: pr.isDraft || false,
          };

          // Add sanitization warnings if any were detected
          if (sanitizationWarnings.length > 0) {
            result._sanitization_warnings = sanitizationWarnings;
          }

          // Add commit SHAs for use with github_fetch_content
          // Use head_sha/base_sha as branch parameter to view PR files
          if (pr.headRefName) result.head = pr.headRefName;
          if (pr.headRefOid) result.head_sha = pr.headRefOid; // Use as branch=SHA
          if (pr.baseRefName) result.base = pr.baseRefName;
          if (pr.baseRefOid) result.base_sha = pr.baseRefOid; // Use as branch=SHA

          // Fetch commit data if requested
          if (params.getCommitData && primaryOwner && primaryRepo) {
            const commitData = await fetchPRCommitData(
              primaryOwner,
              primaryRepo,
              pr.number
            );
            if (commitData) {
              result.commits = commitData;
            }
          }

          return result;
        }

        // Handle gh search prs format (general searches)
        if (isSearchCommand) {
          // Sanitize title and body content
          const titleSanitized = await minifyAndSanitizeTextContent(
            pr.title || ''
          );
          const bodySanitized = pr.body
            ? await minifyAndSanitizeTextContent(pr.body)
            : { content: undefined, warnings: [] };

          // Collect all sanitization warnings
          const sanitizationWarnings = [
            ...titleSanitized.warnings,
            ...bodySanitized.warnings,
          ];

          const result: GitHubPullRequestItem = {
            number: pr.number,
            title: titleSanitized.content,
            body: bodySanitized.content,
            state: pr.state,
            author: pr.author?.login || '',
            repository:
              pr.repository?.nameWithOwner || pr.repository?.name || 'unknown',
            labels: pr.labels?.map((l: any) => l.name) || [],
            created_at: toDDMMYYYY(pr.createdAt || pr.created_at),
            updated_at: toDDMMYYYY(pr.updatedAt || pr.updated_at),
            url: pr.url,
            comments: pr.comments || [], // Will be filtered based on withComments parameter
            reactions: 0, // Not available in search format, would need separate API call
            draft: pr.isDraft || pr.draft || false,
          };

          // Add sanitization warnings if any were detected
          if (sanitizationWarnings.length > 0) {
            result._sanitization_warnings = sanitizationWarnings;
          }

          // Optional fields
          if (pr.closedAt || pr.closed_at) {
            result.closed_at = toDDMMYYYY(pr.closedAt || pr.closed_at);
          }

          // For commit SHAs in search results, we need to make additional API calls
          // if getCommitData is requested or if specifically needed
          if (params.getCommitData || params.owner) {
            // Extract owner/repo from repository field if not provided in params
            const repoMatch = result.repository.match(/^([^/]+)\/([^/]+)$/);
            if (repoMatch) {
              const [, owner, repo] = repoMatch;

              // Fetch PR details including commit SHAs
              try {
                const prDetailsResult = await executeGitHubCommand(
                  'pr',
                  [
                    'view',
                    pr.number.toString(),
                    '--json',
                    'headRefName,headRefOid,baseRefName,baseRefOid',
                    '--repo',
                    `${owner}/${repo}`,
                  ],
                  { cache: false }
                );

                if (!prDetailsResult.isError) {
                  const prDetails = JSON.parse(
                    prDetailsResult.content[0].text as string
                  );
                  const details = prDetails.result;

                  if (details.headRefName) result.head = details.headRefName;
                  if (details.headRefOid) result.head_sha = details.headRefOid;
                  if (details.baseRefName) result.base = details.baseRefName;
                  if (details.baseRefOid) result.base_sha = details.baseRefOid;
                }
              } catch (e) {
                // Silently continue if we can't fetch PR details
              }

              // Fetch commit data if requested
              if (params.getCommitData) {
                const commitData = await fetchPRCommitData(
                  owner,
                  repo,
                  pr.number
                );
                if (commitData) {
                  result.commits = commitData;
                }
              }
            }
          }

          return result;
        }

        // This should never happen with current CLI commands
        throw new Error(
          `Unexpected PR data format: ${JSON.stringify(pr).substring(0, 100)}...`
        );
      })
    );

    // Filter results based on withComments parameter
    const filteredPRs = filterPRResults(cleanPRs, params.withComments);

    const searchResult: GitHubPullRequestsSearchResult = {
      results: filteredPRs,
      total_count: filteredPRs.length, // gh search prs doesn't provide total_count in the same way
    };

    // Add helpful context if filtering by branches that might not exist
    let additionalContext = '';
    if (
      cleanPRs.length === 0 &&
      params.owner &&
      params.repo &&
      (params.head || params.base)
    ) {
      additionalContext =
        '\n\nNote: No PRs found with specified branch filters. Consider removing head/base filters or checking if branches exist.';
    }

    // Generate smart hints for successful results
    const hints = generateSmartHints(GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME, {
      hasResults: true,
      totalItems: filteredPRs.length,
      customHints: additionalContext
        ? ['Branch filters may need adjustment']
        : [],
    });

    return createResult({
      data: searchResult,
      hints,
      ...(additionalContext && { message: additionalContext }),
    });
  });
}

export function buildGitHubPullRequestsAPICommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  // COMMAND SELECTION STRATEGY:
  // 1. For single repository searches (owner + repo specified): use gh pr list
  //    - Provides commit SHAs (head_sha, base_sha) for github_fetch_content integration
  //    - Better performance and more detailed metadata for single repo
  //    - Supports fewer filters but sufficient for focused searches
  //
  // 2. For general searches (no specific repo or multi-repo): use gh search prs
  //    - More powerful search capabilities across all accessible repositories
  //    - Supports all available search filters and operators
  //    - Better for discovery and broad searches

  // Check if this is a single repository search
  // Handle both string and array parameters (use first element if array)
  const hasOwner =
    params.owner &&
    (Array.isArray(params.owner) ? params.owner.length > 0 : true);
  const hasRepo =
    params.repo && (Array.isArray(params.repo) ? params.repo.length > 0 : true);
  const isSingleRepoSearch =
    hasOwner &&
    hasRepo &&
    (!Array.isArray(params.owner) || params.owner.length === 1) &&
    (!Array.isArray(params.repo) || params.repo.length === 1);

  if (isSingleRepoSearch) {
    return buildGitHubPullRequestsListCommand(params);
  }

  // For general searches, use gh search prs instead of GitHub API search
  // This provides better search capabilities and more natural query syntax
  return buildGitHubPullRequestsSearchCommand(params);
}

/**
 * Helper function to add array/single parameters to command args
 * GitHub CLI expects comma-separated values for multi-value flags, not repeated flags
 */
function addParameterToArgs(
  args: string[],
  flag: string,
  value: string | string[] | undefined
): void {
  if (!value) return;

  // Handle arrays by creating multiple flags (especially important for owner, repo, etc.)
  if (Array.isArray(value)) {
    value.forEach((item: string) => args.push(`--${flag}`, item));
  } else {
    args.push(`--${flag}`, value);
  }
}

/**
 * Validate parameter combinations and return warnings for potentially problematic usage
 */
function validateParameterCombinations(
  params: GitHubPullRequestsSearchParams
): string[] {
  const warnings: string[] = [];

  // Warn about multi-owner searches which have limited practical use
  if (Array.isArray(params.owner) && params.owner.length > 1) {
    warnings.push(
      'Multi-owner searches have limited effectiveness in GitHub CLI'
    );
  }

  // Warn about multi-repo searches without owner specification
  if (Array.isArray(params.repo) && params.repo.length > 1 && !params.owner) {
    warnings.push(
      'Multi-repo searches work best when combined with a single owner parameter'
    );
  }

  // Warn about complex array combinations that may not work as expected
  const arrayParams = [
    params.owner && Array.isArray(params.owner) ? 'owner' : null,
    params.repo && Array.isArray(params.repo) ? 'repo' : null,
    params.label && Array.isArray(params.label) ? 'label' : null,
    params.visibility && Array.isArray(params.visibility) ? 'visibility' : null,
  ].filter(Boolean);

  if (arrayParams.length > 2) {
    warnings.push(
      `Using multiple array parameters (${arrayParams.join(', ')}) may produce unexpected results`
    );
  }

  return warnings;
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

/**
 * Build gh search prs command for general PR searches across all accessible repositories
 * Maps parameters to CLI flags with support for arrays, operators, and date ranges.
 *
 * KEY FEATURES:
 * - Multi-value support: owner, repo, label, visibility accept arrays
 * - Operator support: date/numeric filters support >, >=, <, <=, ranges
 * - Comprehensive filtering: 30+ filter types covering all PR attributes
 */
export function buildGitHubPullRequestsSearchCommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  const args: string[] = ['prs'];

  // Query is optional - you can search using filters only
  if (params.query && params.query.trim()) {
    args.push(params.query.trim()); // Main search query
  }

  // Always add JSON output and limit
  args.push(
    '--json',
    // Request comprehensive PR data including new fields for better analysis
    'assignees,author,authorAssociation,body,closedAt,commentsCount,createdAt,id,isDraft,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url',
    '--limit',
    String(Math.min(params.limit || 30, 100))
  );

  // SORTING AND ORDERING
  // Controls how results are ranked and displayed
  if (params.sort) {
    args.push('--sort', params.sort);
  }
  if (params.order) {
    args.push('--order', params.order);
  }

  // BASIC STATE FILTERS
  // Core PR state and type filters
  if (params.state) {
    args.push('--state', params.state); // open, closed
  }
  if (params.draft !== undefined) {
    if (params.draft) {
      args.push('--draft'); // Only draft PRs
    }
    // Note: gh search prs doesn't have --no-draft, use query syntax if needed
  }
  if (params.merged !== undefined) {
    if (params.merged) {
      args.push('--merged'); // Only merged PRs
    }
    // Note: for non-merged PRs, would need query syntax like "is:unmerged"
  }
  if (params.locked !== undefined) {
    if (params.locked) {
      args.push('--locked'); // Only locked conversations
    }
  }

  // USER INVOLVEMENT FILTERS
  // Filter by different types of user involvement in PRs
  if (params.author) {
    args.push('--author', params.author); // PR creator
  }
  if (params.assignee) {
    args.push('--assignee', params.assignee); // PR assignee
  }
  if (params.mentions) {
    args.push('--mentions', params.mentions); // User mentioned with @username
  }
  if (params.commenter) {
    args.push('--commenter', params.commenter); // User who commented
  }
  if (params.involves) {
    args.push('--involves', params.involves); // User involved in any way
  }
  if (params['reviewed-by']) {
    args.push('--reviewed-by', params['reviewed-by']); // User who reviewed
  }
  if (params['review-requested']) {
    args.push('--review-requested', params['review-requested']); // User/team requested to review
  }

  // REPOSITORY FILTERS
  // Filter by repository characteristics and ownership
  addParameterToArgs(args, 'owner', params.owner);
  addParameterToArgs(args, 'repo', params.repo);
  if (params.language) {
    args.push('--language', params.language); // Primary programming language
  }
  if (params.archived !== undefined) {
    args.push('--archived', String(params.archived)); // Archived repo state
  }
  addParameterToArgs(args, 'visibility', params.visibility);

  // BRANCH FILTERS
  // Filter by source and target branches
  if (params.head) {
    args.push('--head', params.head); // Source branch (where changes come from)
  }
  if (params.base) {
    args.push('--base', params.base); // Target branch (where changes go to)
  }

  // DATE FILTERS
  // Support flexible date filtering with operators (>, >=, <, <=, ranges)
  if (params.created) {
    args.push('--created', params.created); // When PR was created
  }
  if (params.updated) {
    args.push('--updated', params.updated); // When PR was last updated
  }
  if (params['merged-at']) {
    args.push('--merged-at', params['merged-at']); // When PR was merged
  }
  if (params.closed) {
    args.push('--closed', params.closed); // When PR was closed
  }

  // ENGAGEMENT FILTERS
  // Filter by community engagement metrics (comments, reactions, interactions)
  if (params.comments !== undefined) {
    args.push('--comments', String(params.comments)); // Number of comments
  }
  if (params.reactions !== undefined) {
    args.push('--reactions', String(params.reactions)); // Number of reactions (👍, ❤️, etc.)
  }
  if (params.interactions !== undefined) {
    args.push('--interactions', String(params.interactions)); // Total reactions + comments
  }

  // REVIEW AND CI FILTERS
  // Filter by code review status and continuous integration results
  if (params.checks) {
    args.push('--checks', params.checks); // CI check status: pending, success, failure
  }
  if (params.review) {
    args.push('--review', params.review); // Review status: none, required, approved, changes_requested
  }

  // ORGANIZATION AND PROJECT FILTERS
  // Filter by organizational structures and project management
  if (params.app) {
    args.push('--app', params.app); // GitHub App that created the PR
  }
  if (params['team-mentions']) {
    args.push('--team-mentions', params['team-mentions']); // Team mentioned (@org/team-name)
  }
  if (params.milestone) {
    args.push('--milestone', params.milestone); // Milestone title
  }
  if (params.project) {
    args.push('--project', params.project); // Project board (owner/number format)
  }

  // BOOLEAN "MISSING" FILTERS
  // Filter for PRs that are missing certain attributes
  if (params['no-assignee']) {
    args.push('--no-assignee'); // PRs without assignees
  }
  if (params['no-label']) {
    args.push('--no-label'); // PRs without any labels
  }
  if (params['no-milestone']) {
    args.push('--no-milestone'); // PRs without milestones
  }
  if (params['no-project']) {
    args.push('--no-project'); // PRs not in any project
  }

  // LABEL FILTERS
  // Filter by PR labels (supports multiple labels)
  addParameterToArgs(args, 'label', params.label);

  // SEARCH SCOPE FILTERS
  // Restrict search to specific fields within PRs
  if (params.match) {
    params.match.forEach(field => {
      args.push('--match', field); // title, body, comments
    });
  }

  return { command: 'search', args };
}

/**
 * Build gh pr list command for repository-specific PR searches
 * This approach is used when both owner and repo are specified, providing:
 * - Direct access to commit SHAs (head_sha, base_sha) for integration with github_fetch_content
 * - Better performance for single-repository searches
 * - More detailed PR metadata
 *
 * LIMITATIONS:
 * - Only works with single repository (uses first owner/repo if arrays provided)
 * - Fewer search filters compared to gh search prs
 * - Cannot search across multiple repositories simultaneously
 *
 * REPOSITORY HANDLING:
 * - If owner/repo are arrays, uses the first value from each
 * - This ensures compatibility while focusing on single-repo searches
 * - For multi-repo searches, the function falls back to buildGitHubPullRequestsSearchCommand
 */
export function buildGitHubPullRequestsListCommand(
  params: GitHubPullRequestsSearchParams
): { command: GhCommand; args: string[] } {
  // Handle array-based owner/repo parameters by using the first value
  // This maintains compatibility while supporting the enhanced parameter types
  const owner = Array.isArray(params.owner) ? params.owner[0] : params.owner;
  const repo = Array.isArray(params.repo) ? params.repo[0] : params.repo;

  // Validate that we have both owner and repo for repository-specific search
  if (!owner || !repo) {
    throw new Error(
      'Both owner and repo are required for repository-specific PR search'
    );
  }

  const args: string[] = [
    'list',
    '--repo',
    `${owner}/${repo}`,
    '--json',
    // Request comprehensive PR data with commit SHAs for github_fetch_content integration
    'number,title,body,headRefName,headRefOid,baseRefName,baseRefOid,state,author,labels,createdAt,updatedAt,url,comments,isDraft',
    '--limit',
    String(Math.min(params.limit || 30, 100)),
  ];

  // BASIC STATE FILTERS
  // gh pr list supports fewer filters than gh search prs
  if (params.state) {
    args.push('--state', params.state); // open, closed
  }

  // USER FILTERS
  if (params.author) {
    args.push('--author', params.author); // PR creator
  }
  if (params.assignee) {
    args.push('--assignee', params.assignee); // PR assignee
  }

  // BRANCH FILTERS
  if (params.head) {
    args.push('--head', params.head); // Source branch
  }
  if (params.base) {
    args.push('--base', params.base); // Target branch
  }

  // LABEL FILTERS
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      args.push('--label', label);
    });
  }

  return { command: 'pr', args };
}

/**
 * Filter PR results based on withComments parameter
 * Removes comments array when withComments is false (default behavior)
 */
function filterPRResults(
  prs: GitHubPullRequestItem[],
  withComments: boolean = false
): GitHubPullRequestItem[] {
  if (withComments) {
    // Keep comments as they are
    return prs;
  }

  // Remove comments from each PR when withComments is false
  return prs.map(pr => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { comments, ...prWithoutComments } = pr;
    return prWithoutComments;
  });
}

async function fetchPRCommitData(
  owner: string,
  repo: string,
  prNumber: number
) {
  try {
    // First, get the list of commits in the PR
    const commitsResult = await executeGitHubCommand(
      'pr',
      [
        'view',
        prNumber.toString(),
        '--json',
        'commits',
        '--repo',
        `${owner}/${repo}`,
      ],
      { cache: false }
    );

    if (commitsResult.isError) {
      return null;
    }

    const commitsData = JSON.parse(commitsResult.content[0].text as string);
    const commits = commitsData.result?.commits || [];

    if (commits.length === 0) {
      return null;
    }

    // Fetch detailed commit data for each commit (limit to first 10 to avoid rate limits)
    const commitDetails = await Promise.all(
      commits.slice(0, 10).map(async (commit: any) => {
        try {
          const commitResult = await executeGitHubCommand(
            'api',
            [`repos/${owner}/${repo}/commits/${commit.oid}`],
            { cache: false }
          );

          if (!commitResult.isError) {
            const commitData = JSON.parse(
              commitResult.content[0].text as string
            );
            const result = commitData.result;

            // Sanitize commit message
            const messageSanitized = ContentSanitizer.sanitizeContent(
              commit.messageHeadline || ''
            );
            const commitWarnings = [...messageSanitized.warnings];

            return {
              sha: commit.oid,
              message: messageSanitized.content,
              author:
                commit.authors?.[0]?.login ||
                commit.authors?.[0]?.name ||
                'Unknown',
              url: `https://github.com/${owner}/${repo}/commit/${commit.oid}`,
              authoredDate: commit.authoredDate,
              diff: result.files
                ? {
                    changed_files: result.files.length,
                    additions: result.stats?.additions || 0,
                    deletions: result.stats?.deletions || 0,
                    total_changes: result.stats?.total || 0,
                    files: result.files.slice(0, 5).map((f: any) => {
                      const fileObj: any = {
                        filename: f.filename,
                        status: f.status,
                        additions: f.additions,
                        deletions: f.deletions,
                        changes: f.changes,
                      };

                      // Sanitize patch content if present
                      if (f.patch) {
                        const rawPatch =
                          f.patch.substring(0, 1000) +
                          (f.patch.length > 1000 ? '...' : '');
                        const patchSanitized =
                          ContentSanitizer.sanitizeContent(rawPatch);
                        fileObj.patch = patchSanitized.content;

                        // Collect patch sanitization warnings
                        if (patchSanitized.warnings.length > 0) {
                          commitWarnings.push(
                            ...patchSanitized.warnings.map(
                              w => `[${f.filename}] ${w}`
                            )
                          );
                        }
                      }

                      return fileObj;
                    }),
                  }
                : undefined,
              // Add sanitization warnings if any were detected
              ...(commitWarnings.length > 0 && {
                _sanitization_warnings: commitWarnings,
              }),
            };
          }
        } catch (e) {
          // If we can't fetch commit details, return basic info
          return {
            sha: commit.oid,
            message: commit.messageHeadline,
            author:
              commit.authors?.[0]?.login ||
              commit.authors?.[0]?.name ||
              'Unknown',
            url: `https://github.com/${owner}/${repo}/commit/${commit.oid}`,
            authoredDate: commit.authoredDate,
          };
        }
      })
    );

    return {
      total_count: commits.length,
      commits: commitDetails.filter(Boolean),
    };
  } catch (error) {
    return null;
  }
}

async function minifyAndSanitizeTextContent(
  content: string
): Promise<{ content: string; warnings: string[] }> {
  if (!content || !content.trim()) {
    return { content, warnings: [] };
  }

  try {
    // First sanitize for security
    const sanitized = ContentSanitizer.sanitizeContent(content);

    // Then minify the sanitized content
    const minified = await minifyContentV2(sanitized.content, 'content.txt'); // Use .txt to trigger general strategy

    return {
      content: minified.content,
      warnings: sanitized.warnings,
    };
  } catch (error) {
    // Fallback: sanitize without minification if minification fails
    const sanitized = ContentSanitizer.sanitizeContent(content);
    return {
      content: sanitized.content,
      warnings: sanitized.warnings,
    };
  }
}
