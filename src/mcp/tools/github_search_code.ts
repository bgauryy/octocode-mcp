import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchParams } from '../../types';
import {
  createErrorResult,
  createResult,
  createSuccessResult,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `Search code across GitHub repositories using strategic boolean operators and filters with "gh code search" command.

SEARCH PATTERNS:
 OR (broad): "useState hook" → "useState OR hook" (auto-default for multi-word)
 AND (precise): "react AND hooks" (both terms required)
 NOT (filter): "auth NOT test" (exclude unwanted)
 Exact phrases: "useState hook" (quoted for literal match)
 Combine with filters: language, owner, path for laser focus

RESTRICTIVENESS: OR (broadest) < AND < Exact Phrase (most precise)`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      query: z
        .string()
        .min(1)
        .describe(
          'Search query with strategic boolean operators. SEARCH PATTERNS: OR (auto-default): "useState hook" → "useState OR hook" for BROADEST discovery. AND (explicit): "react AND hooks" requires BOTH terms for RESTRICTIVE intersection. EXACT PHRASE (escaped quotes): "useState hook" finds literal sequence for MOST PRECISE targeting. NOT (filtering): "auth NOT test" excludes unwanted results. USAGE GUIDE: Use OR for exploration/alternatives, AND for specific combinations, exact phrases for documentation/APIs, NOT for removing noise. RESTRICTIVENESS: OR < AND < Exact Phrase. No parentheses - simple boolean logic only.'
        ),
      owner: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Repository owner/organization filter. Examples: "microsoft", "google". Combines with other filters for targeted search. get from user orgamizations in case of private repositories search (e.g. for employees of organizations)'
        ),
      repo: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Specific repositories in "owner/repo" format. Examples: "facebook/react", "microsoft/vscode". Requires owner parameter.'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Programming language filter. Examples: "javascript", "python", "typescript", "go". Highly effective for targeted searches.'
        ),
      extension: z
        .string()
        .optional()
        .describe(
          'File extension filter without dot. Examples: "js", "ts", "py", "md", "json". Precise file type targeting.'
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Exact filename filter. Examples: "package.json", "Dockerfile", "README.md", "index.js". Perfect for config files.'
        ),
      path: z
        .string()
        .optional()
        .describe(
          'Directory path filter. Examples: "src/", "test/", "docs/", "components/". Focus search on specific directories.'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'File size filter in KB with operators (e.g., ">100", "<50", "10..100").'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(30)
        .describe('Maximum results to return (1-50, default: 30).'),
      match: z
        .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
        .optional()
        .describe(
          'Search scope: "file" searches code content, "path" searches filenames/paths. Use "path" to find files by name.'
        ),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe(
          'Repository visibility filter: "public", "private", or "internal". Defaults to accessible repositories.'
        ),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        // Validate parameter combinations
        const validationError = validateSearchParameters(args);
        if (validationError) {
          return createResult(validationError, true);
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        const execResult = JSON.parse(result.content[0].text as string);
        const codeResults = JSON.parse(execResult.result);

        // GitHub CLI returns a direct array, not an object with total_count and items
        const items = Array.isArray(codeResults) ? codeResults : [];

        return createSuccessResult({
          query: args.query,
          processed_query: parseSearchQuery(args.query, args),
          total_count: items.length,
          items: items,
          cli_command: execResult.command,
          debug_info: {
            has_complex_boolean_logic: hasComplexBooleanLogic(args.query),
            escaped_args: buildGitHubCliArgs(args),
            original_query: args.query,
          },
        });
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // Handle JSON parsing errors
        if (errorMessage.includes('JSON')) {
          return createErrorResult(
            'GitHub CLI returned invalid response - check if GitHub CLI is up to date with "gh version" and try again',
            error as Error
          );
        }

        return createErrorResult(
          'GitHub code search failed - verify parameters and try with simpler query or specific filters (language, owner, path)',
          error as Error
        );
      }
    }
  );
}

/**
 * Enhanced query parser that handles exact strings, boolean operators, and filters
 */
function parseSearchQuery(query: string, filters: GitHubCodeSearchParams) {
  // Step 1: Handle quoted strings more intelligently
  // Convert escaped quotes to simple quotes to avoid shell escaping issues
  let processedQuery = query.replace(/\\"/g, '"');

  // Step 2: Preserve exact phrases (quoted strings)
  const exactPhrases: string[] = [];

  // Extract quoted strings and replace with placeholders
  const quotedMatches = processedQuery.match(/"[^"]+"/g) || [];
  quotedMatches.forEach((match, index) => {
    const placeholder = `__EXACT_PHRASE_${index}__`;
    exactPhrases.push(match);
    processedQuery = processedQuery.replace(match, placeholder);
  });

  // Step 3: Check complexity BEFORE adding auto-OR logic
  const originalHasComplexLogic = hasComplexBooleanLogic(processedQuery);

  // Step 4: Smart boolean logic - default to OR between terms if no explicit operators
  let searchQuery = processedQuery;

  // Check if query already has explicit boolean operators
  if (!originalHasComplexLogic) {
    // Split by whitespace and join with OR for better search results
    const terms = processedQuery
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 0);
    if (terms.length > 1) {
      searchQuery = terms.join(' OR ');
    }
  }

  // Step 5: Handle filters differently based on ORIGINAL query complexity
  const githubFilters: string[] = [];

  // Always add path and visibility to query string (they don't have CLI equivalents)
  if (filters.path) {
    githubFilters.push(`path:${filters.path}`);
  }

  if (filters.visibility) {
    githubFilters.push(`visibility:${filters.visibility}`);
  }

  // For complex boolean queries, add ALL filters to query string to avoid CLI conflicts
  if (originalHasComplexLogic) {
    if (filters.language) {
      githubFilters.push(`language:${filters.language}`);
    }

    // For complex queries with both language and extension, prioritize language
    if (filters.extension && !filters.language) {
      githubFilters.push(`extension:${filters.extension}`);
    }

    if (filters.filename) {
      githubFilters.push(`filename:${filters.filename}`);
    }

    if (filters.size) {
      githubFilters.push(`size:${filters.size}`);
    }
  }

  // Step 6: Combine query with GitHub filters using proper spacing
  if (githubFilters.length > 0) {
    searchQuery = `${searchQuery} ${githubFilters.join(' ')}`;
  }

  // Step 7: Restore exact phrases
  exactPhrases.forEach((phrase, index) => {
    const placeholder = `__EXACT_PHRASE_${index}__`;
    searchQuery = searchQuery.replace(placeholder, phrase);
  });

  return searchQuery.trim();
}

/**
 * Check if query contains complex boolean logic that might conflict with CLI flags
 */
function hasComplexBooleanLogic(query: string): boolean {
  const booleanOperators = /\b(AND|OR|NOT)\b/i;
  return booleanOperators.test(query);
}

/**
 * Build command line arguments for GitHub CLI with improved parameter handling
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams) {
  const args = ['code'];

  // Parse and add the main search query
  const searchQuery = parseSearchQuery(params.query, params);
  args.push(searchQuery);

  // Determine strategy based on ORIGINAL query complexity, not processed query
  const hasComplexLogic = hasComplexBooleanLogic(params.query);

  // For simple queries, use CLI flags for better performance and validation
  if (!hasComplexLogic) {
    if (params.language) {
      args.push(`--language=${params.language}`);
    }

    if (params.extension) {
      args.push(`--extension=${params.extension}`);
    }

    if (params.filename) {
      args.push(`--filename=${params.filename}`);
    }

    if (params.size) {
      args.push(`--size=${params.size}`);
    }
  }
  // For complex queries, filters are already in the query string (handled by parseSearchQuery)

  // Always add limit
  if (params.limit) {
    args.push(`--limit=${params.limit}`);
  }

  // Handle match parameter with conflict resolution
  if (params.match) {
    const matchValues = Array.isArray(params.match)
      ? params.match
      : [params.match];
    // Use the first match type when multiple are provided
    const matchValue = matchValues[0];
    args.push(`--match=${matchValue}`);
  }

  // Handle owner parameter - can be string or array
  if (params.owner && !params.repo) {
    const ownerValues = Array.isArray(params.owner)
      ? params.owner
      : [params.owner];
    ownerValues.forEach(owner => args.push(`--owner=${owner}`));
  }

  // Handle repository filters with improved validation
  if (params.owner && params.repo) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

    // Create repo filters for each owner/repo combination
    owners.forEach(owner => {
      repos.forEach(repo => {
        // Handle both "owner/repo" format and just "repo" format
        if (repo.includes('/')) {
          args.push(`--repo=${repo}`);
        } else {
          args.push(`--repo=${owner}/${repo}`);
        }
      });
    });
  }

  // JSON output with all available fields
  args.push('--json=repository,path,textMatches,sha,url');

  return args;
}

async function searchGitHubCode(
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

      // Parse specific GitHub CLI error types
      if (errorMessage.includes('authentication')) {
        return createErrorResult(
          'GitHub CLI authentication required - run the api_status_check tool to verify authentication and available organizations',
          error as Error
        );
      }

      if (errorMessage.includes('rate limit')) {
        return createErrorResult(
          'GitHub API rate limit exceeded - wait a few minutes before searching again or use more specific filters to reduce results',
          error as Error
        );
      }

      if (
        errorMessage.includes('validation failed') ||
        errorMessage.includes('Invalid query')
      ) {
        return createErrorResult(
          'Invalid search query syntax - check boolean operators (AND/OR/NOT), quotes for exact phrases, and filter formats. Try simplifying your query',
          error as Error
        );
      }

      if (
        errorMessage.includes('repository not found') ||
        errorMessage.includes('owner not found')
      ) {
        return createErrorResult(
          'Repository or owner not found - run api_status_check tool to verify available organizations and access permissions',
          error as Error
        );
      }

      if (errorMessage.includes('timeout')) {
        return createErrorResult(
          'Search timeout - query too broad or complex. Try adding filters like language, owner, or path to narrow results',
          error as Error
        );
      }

      // Generic fallback with helpful guidance
      return createErrorResult(
        'GitHub code search failed - run api_status_check tool to verify authentication and permissions, or try simplifying your query',
        error as Error
      );
    }
  });
}

/**
 * Validate parameter combinations to prevent conflicts
 */
function validateSearchParameters(
  params: GitHubCodeSearchParams
): string | null {
  // Query validation
  if (!params.query.trim()) {
    return 'Empty search query - provide a search term like "useState", "function init", or "api AND endpoint"';
  }

  if (params.query.length > 1000) {
    return 'Search query too long - limit to 1000 characters. Try breaking into smaller, focused searches';
  }

  // Repository validation
  if (params.repo && !params.owner) {
    return 'Missing owner parameter - when searching specific repositories, format as owner/repo (e.g., "microsoft/vscode") or provide both owner and repo parameters';
  }

  // Invalid characters in query
  if (params.query.includes('\\') && !params.query.includes('\\"')) {
    return 'Invalid escape characters in query - use quotes for exact phrases: "exact phrase" instead of escaping';
  }

  // Boolean operator validation
  const invalidBooleans = params.query.match(/\b(and|or|not)\b/g);
  if (invalidBooleans) {
    return `Boolean operators must be uppercase - use ${invalidBooleans.map(op => op.toUpperCase()).join(', ')} instead of ${invalidBooleans.join(', ')}`;
  }

  // Unmatched quotes
  const quoteCount = (params.query.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    return 'Unmatched quotes in query - ensure all quotes are properly paired for exact phrase matching';
  }

  // Size parameter validation
  if (params.size && !/^[<>]=?\d+$|^\d+\.\.\d+$|^\d+$/.test(params.size)) {
    return 'Invalid size format - use ">100", "<50", "10..100", or "100" for file size filtering';
  }

  return null; // No validation errors
}
