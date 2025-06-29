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
  ERROR_MESSAGES,
  SUGGESTIONS,
  createAuthenticationError,
  createRateLimitError,
  createNoResultsError,
  getErrorWithSuggestion,
} from '../errorMessages';

export const GITHUB_SEARCH_CODE_TOOL_NAME = 'githubSearchCode';

const DESCRIPTION = `Search code across GitHub repositories. Start with simple 1-2 word queries, then refine with filters like language, owner, or filename. Supports exact phrase matching with quotes. Parameters: query (required), language (optional), owner (optional), filename (optional), extension (optional), match (optional), size (optional), limit (optional).`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_CODE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'Search terms. START SIMPLE: Use 1-2 words first (e.g., "useState", "auth"). Add more terms only after seeing initial results.'
          ),

        language: z
          .string()
          .optional()
          .describe(
            'Language filter (javascript, python, etc). Use only when needed.'
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/org. For private repos, use apiStatusCheck first.'
          ),

        filename: z
          .string()
          .optional()
          .describe('Specific filename to search. Use for targeted searches.'),

        extension: z
          .string()
          .optional()
          .describe(
            'File extension (.js, .py, etc). Alternative to language filter.'
          ),

        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            'Search scope: "file" for content, "path" for filenames. Default: file content.'
          ),

        size: z
          .string()
          .optional()
          .describe('File size in KB. Format: >10, <100, or 10..50'),

        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Results limit (1-100). Default: 30'),
      },
      annotations: {
        title: 'GitHub Code Search - Smart & Efficient',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubCodeSearchParams): Promise<CallToolResult> => {
      try {
        // Validate parameter combinations
        const validationError = validateSearchParameters(args);
        if (validationError) {
          return createResult({ error: validationError });
        }

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
          if (args.language || args.owner || args.filename || args.extension) {
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
  );
}

/**
 * Handles various search errors and returns a formatted CallToolResult.
 */
function handleSearchError(errorMessage: string): CallToolResult {
  // Common GitHub search errors with helpful suggestions
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: ERROR_MESSAGES.CLI_INVALID_RESPONSE,
    });
  }

  if (errorMessage.includes('authentication')) {
    return createResult({
      error: createAuthenticationError(),
    });
  }

  if (errorMessage.includes('rate limit')) {
    return createResult({
      error: createRateLimitError(true),
    });
  }

  if (errorMessage.includes('timed out')) {
    return createResult({
      error: ERROR_MESSAGES.SEARCH_TIMEOUT,
    });
  }

  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: ERROR_MESSAGES.INVALID_QUERY_SYNTAX,
    });
  }

  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: ERROR_MESSAGES.REPO_OR_OWNER_NOT_FOUND,
    });
  }

  // Generic fallback with guidance
  return createResult({
    error: `Code search failed: ${errorMessage}\n${SUGGESTIONS.SIMPLIFY_QUERY}`,
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
 * Build command line arguments for GitHub CLI with improved parameter handling.
 * Ensures exact string search capability with proper quote and escape handling.
 *
 * This function is refactored to correctly distinguish between search qualifiers
 * (like `language` and `extension`), which will be passed as separate arguments
 * to `gh search`, and command-line flags (like `--size` and `--limit`).
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const args: string[] = ['code'];

  // Extract qualifiers from the query
  const queryParts = params.query.trim().split(/\s+/);
  const searchTerms: string[] = [];
  const qualifiers: string[] = [];

  queryParts.forEach(part => {
    if (part.includes(':')) {
      qualifiers.push(part);
    } else {
      searchTerms.push(part);
    }
  });

  // Add search terms if any
  if (searchTerms.length > 0) {
    args.push(searchTerms.join(' '));
  }

  // Add extracted qualifiers
  qualifiers.forEach(qualifier => {
    args.push(qualifier);
  });

  // Add explicit parameters as qualifiers
  if (params.language && !params.query.includes('language:')) {
    args.push(`language:${params.language}`);
  }

  if (
    params.owner &&
    !params.query.includes('org:') &&
    !params.query.includes('user:')
  ) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => args.push(`org:${owner}`));
  }

  if (params.filename && !params.query.includes('filename:')) {
    args.push(`filename:${params.filename}`);
  }

  if (params.extension && !params.query.includes('extension:')) {
    args.push(`extension:${params.extension}`);
  }

  if (params.size && !params.query.includes('size:')) {
    args.push(`size:${params.size}`);
  }

  // Handle match parameter
  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    args.push(`in:${matches.join(',')}`);
  }

  // Add limit
  if (params.limit) {
    args.push(`--limit=${params.limit}`);
  }

  // Add JSON output format
  args.push('--json=repository,path,textMatches,sha,url');

  return args;
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
      return handleSearchError(errorMessage); // Delegating error handling
    }
  });
}

/**
 * Enhanced validation with helpful suggestions
 */
function validateSearchParameters(
  params: GitHubCodeSearchParams
): string | null {
  // Query validation
  if (!params.query.trim()) {
    return ERROR_MESSAGES.EMPTY_QUERY;
  }

  if (params.query.length > 1000) {
    return ERROR_MESSAGES.QUERY_TOO_LONG_1000;
  }

  // Repository validation - allow owner/repo format in repo field
  if (params.repo && !params.owner) {
    const repoValues = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasOwnerFormat = repoValues.every(repo => repo.includes('/'));
    if (!hasOwnerFormat) {
      return ERROR_MESSAGES.REPO_FORMAT_ERROR;
    }
  }

  // Add validation for file size limit
  if (params.size) {
    if (!/^([<>]\d+|\d+\.\.\d+)$/.test(params.size)) {
      return ERROR_MESSAGES.INVALID_SIZE_FORMAT;
    }
  }

  // Validate search scope
  if (params.match) {
    const validScopes = ['file', 'path'];
    const scopes = Array.isArray(params.match) ? params.match : [params.match];
    if (!scopes.every(scope => validScopes.includes(scope))) {
      return ERROR_MESSAGES.INVALID_SEARCH_SCOPE;
    }
  }

  // Note about repository limitations (This is a note, not a hard error)
  // This return statement was returning null before, so it shouldn't be an issue
  // if (params.repo || params.owner) {
  //   return null; // Return warning about repository limitations
  // }

  return null; // No validation errors
}
