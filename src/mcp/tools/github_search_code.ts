/* eslint-disable no-console */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCodeSearchParams,
  GitHubCodeSearchItem,
  OptimizedCodeSearchResult,
} from '../../types'; // Ensure these types are correctly defined
import {
  createResult,
  simplifyRepoUrl,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import {
  createNoResultsError,
  getErrorWithSuggestion,
  SUGGESTIONS,
} from '../errorMessages';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { GitHubCodeSearchBuilder } from './utils/GitHubCommandBuilder';

export const GITHUB_SEARCH_CODE_TOOL_NAME = 'githubSearchCode';

const DESCRIPTION = `Search code across GitHub repositories using GitHub CLI.

Choose one search method:
- exactQuery: exact phrase matching
- queryTerms: array of terms (space-separated, AND logic)

Use filters to narrow results after initial broad searches.`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_CODE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        exactQuery: z
          .string()
          .optional()
          .describe('Exact phrase/word to search for'),

        queryTerms: z
          .array(z.string())
          .optional()
          .describe('Array of search terms joined with spaces (AND logic)'),

        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Narrows search to specific language files.'
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s). Organization-wide search.'
          ),

        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Repository filter. Use with owner or full format.'),

        filename: z
          .string()
          .optional()
          .describe('Target specific filename or pattern.'),

        extension: z
          .string()
          .optional()
          .describe(
            'File extension filter. Alternative to language parameter.'
          ),

        match: z
          .enum(['file', 'path'])
          .optional()
          .describe(
            'Search scope: file for file content (default), path for filenames/paths.'
          ),

        size: z
          .string()
          .regex(
            /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
            'Invalid size format. Use: ">N", ">=N", "<N", "<=N", "N..M", or exact number'
          )
          .optional()
          .describe(
            'File size filter in KB. Format: ">N" (larger), "<N" (smaller), "N..M" (range).'
          ),

        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Maximum number of results to return (1-100).'),
      },
      annotations: {
        title: 'GitHub Code Search - Smart & Efficient',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubCodeSearchParams): Promise<CallToolResult> => {
        // Validate that exactly one search parameter is provided (not both)
        const hasExactQuery = !!args.exactQuery;
        const hasQueryTerms = args.queryTerms && args.queryTerms.length > 0;

        if (!hasExactQuery && !hasQueryTerms) {
          return createResult({
            error: 'One search parameter required: exactQuery OR queryTerms',
          });
        }

        if (hasExactQuery && hasQueryTerms) {
          return createResult({
            error:
              'Use either exactQuery OR queryTerms, not both. Choose one search approach.',
          });
        }

        try {
          const result = await searchGitHubCode(args);

          if (result.isError) {
            return result;
          }

          const execResult = JSON.parse(result.content[0].text as string);
          const codeResults: GitHubCodeSearchItem[] = execResult.result;

          // GitHub CLI returns a direct array, not an object with total_count and items
          const items = Array.isArray(codeResults) ? codeResults : [];

          // Smart handling for no results - provide actionable suggestions
          if (items.length === 0) {
            // Provide progressive search guidance based on current parameters
            let specificSuggestion = SUGGESTIONS.CODE_SEARCH_NO_RESULTS;

            // If filters were used, suggest removing them first
            if (
              args.language ||
              args.owner ||
              args.filename ||
              args.extension
            ) {
              specificSuggestion = SUGGESTIONS.CODE_SEARCH_NO_RESULTS;
            }

            return createResult({
              error: getErrorWithSuggestion({
                baseError: createNoResultsError('code'),
                suggestion: specificSuggestion,
              }),
            });
          }

          // Transform to optimized format
          const optimizedResult = transformToOptimizedFormat(items);

          return createResult({ data: optimizedResult });
        } catch (error) {
          const errorMessage = (error as Error).message || '';
          return handleSearchError(errorMessage);
        }
      }
    )
  );
}

/**
 * Handles various search errors and returns a formatted CallToolResult with smart fallbacks.
 */
function handleSearchError(errorMessage: string): CallToolResult {
  // Rate limit with smart timing guidance
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return createResult({
      error: `GitHub API rate limit reached. Try again in 5-10 minutes, or use these strategies:
• Search fewer terms per query
• Use owner/repo filters to narrow scope
• Try npm package search for package-related queries
• Use separate searches instead of complex queries`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status
3. For private repos: use api_status_check to verify org access`,
    });
  }

  // Network/timeout with fallback suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. Try these alternatives:
• Reduce search scope with owner or language filters
• Use github_search_repos to find repositories first
• Try npm package search for package discovery
• Check network connection and retry`,
    });
  }

  // Invalid query with specific fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. Common fixes:
• Remove special characters: ()[]{}*?^$|.\\
• Use quotes only for exact phrases: "error handling"
• Avoid escaped quotes: use term instead of "term"
• Try broader terms: "react" instead of "React.Component"`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. Discovery strategies:
• Use github_search_repos to find correct names
• Check for typos in owner/repo names
• Try without owner filter for broader search
• Use npm package search if looking for packages`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System issue - try:
• Update GitHub CLI: gh extension upgrade
• Retry in a few moments
• Use github_search_repos as alternative
• Check gh auth status for authentication`,
    });
  }

  // Generic fallback with progressive strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

Progressive recovery strategy:
1. Try broader search terms
2. Use github_search_repos to find repositories
3. Use npm package search for package-related queries
4. Check github CLI status: gh auth status`,
  });
}

/**
 * Transform GitHub CLI response to optimized format with enhanced metadata
 */
function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[]
): OptimizedCodeSearchResult {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  const optimizedItems = items.map(item => ({
    path: item.path,
    matches:
      item.textMatches?.map(match => ({
        context: optimizeTextMatch(match.fragment, 120), // Increased context for better understanding
        positions:
          match.matches?.map(m =>
            Array.isArray(m.indices) && m.indices.length >= 2
              ? ([m.indices[0], m.indices[1]] as [number, number])
              : ([0, 0] as [number, number])
          ) || [],
      })) || [],
    url: singleRepo ? item.path : simplifyGitHubUrl(item.url),
    repository: {
      nameWithOwner: item.repository.nameWithOwner,
      url: item.repository.url,
    },
  }));

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: simplifyRepoUrl(singleRepo.url),
    };
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Build command line arguments for GitHub CLI following the exact CLI format.
 * Uses proper flags (--flag=value) for filters and direct query terms.
 */
export function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const builder = new GitHubCodeSearchBuilder();
  return builder.build(params);
}

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const args = buildGitHubCliArgs(params);

      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      return handleSearchError(errorMessage);
    }
  });
}
