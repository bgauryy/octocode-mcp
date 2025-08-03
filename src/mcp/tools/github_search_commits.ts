import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitSearchParams } from '../../types';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createSearchFailedError } from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';
import { searchGitHubCommitsAPI } from '../../utils/githubAPI';

const DESCRIPTION = `Search GitHub commits using the GitHub API with comprehensive filtering and analysis.

PERFORMANCE: getChangesContent=true is token expensive`;

export function registerGitHubSearchCommitsTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    {
      description: DESCRIPTION,
      inputSchema: {
        exactQuery: z
          .string()
          .optional()
          .describe(
            'Exact phrase to search for in commit messages (e.g., "bug fix")'
          ),

        queryTerms: z
          .array(z.string())
          .optional()
          .describe(
            'Array of search terms with AND logic (e.g., ["readme", "typo"] finds commits with both words)'
          ),

        orTerms: z
          .array(z.string())
          .optional()
          .describe(
            'Array of search terms with OR logic (e.g., ["bug", "fix"] finds commits with either word)'
          ),

        // Repository filters
        owner: z
          .string()
          .optional()
          .describe('Repository owner (use with repo param)'),
        repo: z
          .string()
          .optional()
          .describe('Repository name (use with owner param)'),

        // Author filters
        author: z
          .string()
          .optional()
          .describe('GitHub username of commit author (e.g., "octocat")'),
        'author-name': z
          .string()
          .optional()
          .describe('Full name of commit author'),
        'author-email': z
          .string()
          .optional()
          .describe('Email of commit author'),

        // Committer filters
        committer: z
          .string()
          .optional()
          .describe('GitHub username of committer (e.g., "monalisa")'),
        'committer-name': z
          .string()
          .optional()
          .describe('Full name of committer'),
        'committer-email': z.string().optional().describe('Email of committer'),

        // Date filters
        'author-date': z
          .string()
          .optional()
          .describe(
            'Filter by author date (e.g., "<2022-02-01", ">2020-01-01", "2020-01-01..2021-01-01")'
          ),
        'committer-date': z
          .string()
          .optional()
          .describe(
            'Filter by commit date (e.g., "<2022-02-01", ">2020-01-01", "2020-01-01..2021-01-01")'
          ),

        // Hash filters
        hash: z
          .string()
          .optional()
          .describe(
            'Commit SHA (full or partial, including head_sha/base_sha from a PR as returned by github_search_pull_requests)'
          ),
        parent: z.string().optional().describe('Parent commit SHA'),
        tree: z.string().optional().describe('Tree SHA'),

        // State filters
        merge: z
          .boolean()
          .optional()
          .describe('Only merge commits (true) or exclude them (false)'),

        // Visibility
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter'),

        // Pagination and sorting
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Maximum number of results to fetch'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Sort by date field'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order'),
        getChangesContent: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Set to true to fetch actual commit changes (diffs/patches). Works for both public and private repositories, most effective with owner and repo specified. Limited to first 10 commits for rate limiting. WARNING: EXTREMELY expensive in tokens - each commit diff can consume thousands of tokens.'
          ),
      },
      annotations: {
        title: 'GitHub Commit Search - API Only',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubCommitSearchParams): Promise<CallToolResult> => {
        // Validate search parameters
        const hasExactQuery = !!args.exactQuery;
        const hasQueryTerms = args.queryTerms && args.queryTerms.length > 0;
        const hasOrTerms = args.orTerms && args.orTerms.length > 0;

        // Check if any filters are provided
        const hasFilters = !!(
          args.author ||
          args.committer ||
          args['author-name'] ||
          args['committer-name'] ||
          args['author-email'] ||
          args['committer-email'] ||
          args.hash ||
          args.parent ||
          args.tree ||
          args['author-date'] ||
          args['committer-date'] ||
          args.merge !== undefined ||
          args.visibility ||
          (args.owner && args.repo)
        );

        // Allow search with just filters (no query required)
        if (!hasExactQuery && !hasQueryTerms && !hasOrTerms && !hasFilters) {
          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            errorMessage: 'No search criteria provided',
            customHints: [
              'Add search query OR filters',
              'Try specific repo: --owner owner --repo repo',
            ],
          });
          return createResult({
            error:
              'At least one search parameter required: exactQuery, queryTerms, orTerms, or filters (author, committer, hash, date, etc.)',
            hints,
          });
        }

        if (hasExactQuery && (hasQueryTerms || hasOrTerms)) {
          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            errorMessage: 'Invalid query combination',
            customHints: [
              'Use exactQuery alone',
              'Or combine queryTerms + orTerms',
            ],
          });
          return createResult({
            error:
              'exactQuery cannot be combined with queryTerms or orTerms. Use exactQuery alone or combine queryTerms + orTerms.',
            hints,
          });
        }

        try {
          const result = await searchGitHubCommitsAPI(args, opts.ghToken);

          // Check if result is an error
          if ('error' in result) {
            const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
              hasResults: false,
              errorMessage: result.error,
              customHints: result.hints || [],
            });
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - return raw data wrapped for MCP
          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: result.commits.length > 0,
            totalItems: result.commits.length,
          });

          return createResult({
            data: {
              ...result,
              apiSource: true,
            },
            hints,
          });
        } catch (error) {
          const hints = generateSmartHints(TOOL_NAMES.GITHUB_SEARCH_COMMITS, {
            hasResults: false,
            errorMessage: 'Search failed',
          });
          return createResult({
            error: createSearchFailedError('commits'),
            hints,
          });
        }
      }
    )
  );
}
