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

const DESCRIPTION = `Search code across GitHub repositories using GitHub's code search API.

Never use filters and flags on exploretory searches and on initial searches.
Use filters and flags on subsequent searches when you know what to search for or if the user asks for it explicitly.
Using too many flags might make miss relevant results. Use filters and flags to narrow down the results when getting too many.

Search Syntax (all terms must be present with AND logic):
- Multiple words: react lifecycle → finds files with BOTH "react" AND "lifecycle" (separate words) in the same file
- Exact phrases: "error handling" → finds exact phrase "error handling" (quoted phrase) in the same file
- Mixed: "async function" timeout → finds exact phrase "async function" AND word "timeout" in the same file

Key difference: Quotes create exact phrases, no quotes = individual words (all must be present).
Start with 1-2 terms, add more to narrow results. Use filters and flags for precision.

`;

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
            'Search query with AND logic between terms. Multiple words require ALL to be present. Use quotes for exact phrases.'
          ),

        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Narrows search to specific language files. Use for language-specific searches.'
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s) to search within (e.g., "facebook", ["google", "microsoft"]). Use this to search within specific organizations. Do NOT use owner/repo format - just the organization/username.'
          ),

        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter on specific repository(ies). Must use full "owner/repo" format (e.g., "facebook/react", ["vuejs/vue", "angular/angular"]). Use this for searching within specific repositories.'
          ),

        filename: z
          .string()
          .optional()
          .describe(
            'Target specific filename or pattern. Use for file-specific searches.'
          ),

        extension: z
          .string()
          .optional()
          .describe(
            'File extension filter. Alternative to language parameter.'
          ),

        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            'Search scope: "file" for file content (default), "path" for filenames/paths, or ["file", "path"] for both. Controls where to search for terms.'
          ),

        size: z
          .string()
          .regex(
            /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
            'Invalid size format. Use: ">10", ">=5", "<100", "<=50", "10..100", or exact number "50"'
          )
          .optional()
          .describe(
            'File size filter in KB. Format: ">10" (larger than), ">=5" (at least), "<100" (smaller than), "<=50" (at most), "10..50" (range), "25" (exact).'
          ),

        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            'Maximum number of results to return (1-100). Default: 30. Higher values may increase response time.'
          ),
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
 * Build command line arguments for GitHub CLI with improved parameter handling.
 * Preserves quoted phrases and supports both AND search and exact phrase matching.
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const args: string[] = ['code'];

  // Parse query to preserve quoted phrases and extract qualifiers
  const { searchQuery, extractedQualifiers } = parseSearchQuery(params.query);

  // Add the main search query if present
  if (searchQuery) {
    args.push(searchQuery);
  }

  // Add extracted qualifiers from the query
  extractedQualifiers.forEach(qualifier => {
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

  if (params.repo && !params.query.includes('repo:')) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    repos.forEach(repo => args.push(`repo:${repo}`));
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

  // Repository validation - ensure owner is provided correctly
  if (
    params.owner &&
    typeof params.owner === 'string' &&
    params.owner.includes('/')
  ) {
    return 'Owner parameter should contain only the username/org name, not owner/repo format. For repository-specific searches, use org: or user: qualifiers in the query.';
  }

  if (Array.isArray(params.owner)) {
    const hasSlashFormat = params.owner.some(owner => owner.includes('/'));
    if (hasSlashFormat) {
      return 'Owner parameter should contain only usernames/org names, not owner/repo format. For repository-specific searches, use repo: qualifier in the query.';
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

/**
 * Parse search query to preserve quoted phrases and extract qualifiers.
 * Handles:
 * - Quoted phrases: "error handling" -> kept as single unit
 * - Multiple terms: react lifecycle -> both terms for AND search
 * - Mixed: "error handling" debug -> phrase + term
 * - Qualifiers: language:javascript -> extracted separately
 */
function parseSearchQuery(query: string): {
  searchQuery: string;
  extractedQualifiers: string[];
} {
  const qualifiers: string[] = [];
  const searchTerms: string[] = [];

  // Regular expression to match quoted strings or individual words/qualifiers
  const tokenRegex = /"([^"]+)"|([^\s]+)/g;
  let match;

  while ((match = tokenRegex.exec(query)) !== null) {
    const token = match[1] || match[2]; // match[1] is quoted content, match[2] is unquoted

    // Check if it's a qualifier (contains : but not inside quotes)
    if (!match[1] && token.includes(':') && /^[a-zA-Z]+:/.test(token)) {
      qualifiers.push(token);
    } else {
      // It's a search term (either quoted or unquoted)
      if (match[1]) {
        // Preserve quotes for exact phrase search
        searchTerms.push(`"${token}"`);
      } else {
        searchTerms.push(token);
      }
    }
  }

  return {
    searchQuery: searchTerms.join(' '),
    extractedQualifiers: qualifiers,
  };
}
