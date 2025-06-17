import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GitHubCodeSearchParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

// Regex patterns for query analysis - centralized to avoid duplication
const QUERY_PATTERNS = {
  // Detects boolean operators (AND, OR, NOT)
  BOOLEAN_OPERATORS: /\b(AND|OR|NOT)\b/,
  // Detects GitHub qualifiers (word:value patterns like language:javascript)
  GITHUB_QUALIFIERS: /\w+:[^\s]+/,
  // Detects special characters that need quoting
  SPECIAL_CHARS: /[\s><|&;]/,
  // Detects size filter operators
  SIZE_OPERATORS: /[><]/,
} as const;

/**
 * Searches GitHub code repositories using the GitHub CLI.
 *
 * This function handles the core code search functionality, including:
 * - Query processing and optimization
 * - Parameter validation and transformation
 * - GitHub CLI command construction
 * - Result parsing and formatting
 *
 * @param params - Search parameters including query, filters, and options
 * @returns Promise resolving to formatted search results
 */
export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      // Build the GitHub CLI command with all parameters
      const { command, args } = buildGitHubCodeSearchCommand(params);

      // Execute the command using the GitHub CLI
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      // Handle execution errors
      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result wrapper
      const execResult = JSON.parse(result.content[0].text as string);
      const rawContent = execResult.result;

      // Parse and format the search results
      try {
        const codeResults = JSON.parse(rawContent);
        return createSuccessResult({
          searchType: 'code',
          query: params.query || '',
          results: codeResults,
        });
      } catch (parseError) {
        // Fallback: return raw content if JSON parsing fails
        // This can happen with malformed responses or CLI errors
        return createSuccessResult({
          searchType: 'code',
          query: params.query || '',
          results: rawContent,
        });
      }
    } catch (error) {
      return createErrorResult('Failed to search GitHub code', error);
    }
  });
}

/**
 * Builds the GitHub CLI command for code search.
 *
 * This function handles the complex logic of:
 * - Query formatting and escaping
 * - Boolean operator preservation
 * - GitHub qualifier handling
 * - Parameter flag construction
 * - Qualifier merging
 *
 * @param params - Search parameters
 * @returns Object containing command and arguments array
 */
function buildGitHubCodeSearchCommand(params: GitHubCodeSearchParams): {
  command: string;
  args: string[];
} {
  const args = ['code'];

  // Process the main search query with intelligent formatting
  if (params.query) {
    const formattedQuery = formatSearchQuery(params.query);
    args.push(formattedQuery);
  }

  // Add file and content filters
  if (params.language) args.push(`--language=${params.language}`);
  if (params.filename) args.push(`--filename=${params.filename}`);
  if (params.extension) {
    // Remove leading dot if present (GitHub CLI handles this)
    const cleanExtension = params.extension.replace(/^\./, '');
    args.push(`--extension=${cleanExtension}`);
  }

  // Handle size filter with proper quoting for operators
  if (params.size) {
    const sizeArg = QUERY_PATTERNS.SIZE_OPERATORS.test(params.size)
      ? `--size="${params.size}"` // Quote size filters with operators
      : `--size=${params.size}`;
    args.push(sizeArg);
  }

  // Add repository and ownership filters
  addRepositoryFilters(args, params);

  // Merge additional qualifiers into the query
  mergeQueryQualifiers(args, params);

  // Add standard output and control flags
  args.push('--json=repository,path,textMatches,sha,url');
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.match) args.push(`--match=${params.match}`);

  return { command: 'search', args };
}

/**
 * Formats the search query with proper escaping and operator preservation.
 *
 * This function determines whether to quote the query based on its content:
 * - Preserves boolean operators (AND, OR, NOT) without quoting
 * - Preserves GitHub qualifiers (language:, path:, etc.) without quoting
 * - Quotes queries with special characters to prevent shell interpretation
 * - Leaves simple queries unquoted
 *
 * @param query - The raw search query
 * @returns Properly formatted query string
 */
function formatSearchQuery(query: string): string {
  const hasBooleanOps = QUERY_PATTERNS.BOOLEAN_OPERATORS.test(query);
  const hasGitHubQualifiers = QUERY_PATTERNS.GITHUB_QUALIFIERS.test(query);

  // Preserve advanced syntax by not quoting
  if (hasBooleanOps || hasGitHubQualifiers) {
    return query;
  }

  // Quote queries with special characters to prevent shell interpretation
  if (QUERY_PATTERNS.SPECIAL_CHARS.test(query)) {
    return `"${query}"`;
  }

  // Simple queries without special characters
  return query;
}

/**
 * Adds repository and ownership filter flags to the command arguments.
 *
 * Handles the logic for:
 * - Multiple repository specifications
 * - Owner-only filtering
 * - Combined owner/repo filtering
 *
 * @param args - Command arguments array (modified in place)
 * @param params - Search parameters containing repository filters
 */
function addRepositoryFilters(
  args: string[],
  params: GitHubCodeSearchParams
): void {
  // Handle specific repository filters
  if (params.owner && params.repo) {
    if (Array.isArray(params.repo)) {
      // Multiple repositories from the same owner
      params.repo.forEach(r => args.push(`--repo=${params.owner}/${r}`));
    } else {
      // Single repository
      args.push(`--repo=${params.owner}/${params.repo}`);
    }
  } else if (params.owner) {
    // Owner-only filter (searches all repos from owner)
    args.push(`--owner=${params.owner}`);
  }
}

/**
 * Merges additional search qualifiers into the main query.
 *
 * This function takes qualifiers that can't be expressed as CLI flags
 * and incorporates them directly into the search query string.
 * It preserves the existing query formatting logic.
 *
 * @param args - Command arguments array (modified in place)
 * @param params - Search parameters containing qualifiers
 */
function mergeQueryQualifiers(
  args: string[],
  params: GitHubCodeSearchParams
): void {
  // Build list of additional qualifiers that need to be in the query string
  const queryQualifiers: string[] = [];

  if (params.path) queryQualifiers.push(`path:${params.path}`);
  if (params.symbol) queryQualifiers.push(`symbol:${params.symbol}`);
  if (params.content) queryQualifiers.push(`content:${params.content}`);
  if (params.user) queryQualifiers.push(`user:${params.user}`);
  if (params.org) queryQualifiers.push(`org:${params.org}`);

  // Handle repository property qualifiers (is:archived, is:fork, etc.)
  if (params.is && params.is.length > 0) {
    params.is.forEach(prop => queryQualifiers.push(`is:${prop}`));
  }

  // If we have qualifiers to merge, update the query
  if (queryQualifiers.length > 0) {
    const currentQuery = args[1] || ''; // Query is at index 1 after 'code'
    const enhancedQuery = `${currentQuery} ${queryQualifiers.join(' ')}`.trim();

    // Apply the same formatting logic to the enhanced query
    args[1] = formatSearchQuery(enhancedQuery);
  }
}
