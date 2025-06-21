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

const DESCRIPTION = `Find code patterns across repositories with boolean logic and precision filters. Essential for implementation research, API usage discovery, and architectural analysis.`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'Search query. Use "exact phrases", AND/OR operators, or natural language. Examples: "useEffect cleanup", "react AND hooks", "API endpoint"'
          ),
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Target organization/user. Use for focused searches or private repo access.'
          ),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Specific repositories. Format: "owner/repo" or just "repo" with owner param.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Highly effective for targeted searches.'
          ),
        extension: z
          .string()
          .optional()
          .describe(
            'File extension without dot. Use for config files, specific types.'
          ),
        filename: z
          .string()
          .optional()
          .describe(
            'Exact filename. Perfect for package.json, webpack.config.js, etc.'
          ),
        path: z
          .string()
          .optional()
          .describe(
            'Directory path filter. Focus on specific folders like src/, lib/, test/.'
          ),
        size: z
          .string()
          .optional()
          .describe(
            'File size filter. Examples: ">100", "<1000", "100..500" (bytes).'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe('Max results. Default 20 for research efficiency.'),
        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            'Search scope: "file" for code content, "path" for filenames.'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter.'),
      },
      annotations: {
        title: 'GitHub Code Search',
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
            'Invalid CLI response - update GitHub CLI or check authentication',
            error as Error
          );
        }

        return createErrorResult(
          'Code search failed - simplify query or add filters (language, owner, path)',
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

  // Step 4: Smart boolean logic - default to AND between terms if no explicit operators
  let searchQuery = processedQuery;

  // Check if query already has explicit boolean operators
  if (!originalHasComplexLogic) {
    // For code search, terms should appear together by default (AND logic)
    // Only split into separate terms if that's explicitly requested
    // GitHub CLI code search handles space-separated terms as AND by default
    searchQuery = processedQuery; // Keep original query for natural AND behavior
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

      // Parse specific GitHub CLI error types
      if (errorMessage.includes('authentication')) {
        return createErrorResult(
          'Authentication required - run api_status_check',
          error as Error
        );
      }

      if (errorMessage.includes('rate limit')) {
        return createErrorResult(
          'Rate limit exceeded - add specific filters or wait',
          error as Error
        );
      }

      if (
        errorMessage.includes('validation failed') ||
        errorMessage.includes('Invalid query')
      ) {
        return createErrorResult(
          'Invalid query syntax - check operators and quotes',
          error as Error
        );
      }

      if (
        errorMessage.includes('repository not found') ||
        errorMessage.includes('owner not found')
      ) {
        return createErrorResult(
          'Repository not found - verify names and permissions',
          error as Error
        );
      }

      if (errorMessage.includes('timeout')) {
        return createErrorResult(
          'Search timeout - add filters to narrow scope',
          error as Error
        );
      }

      // Generic fallback
      return createErrorResult(
        'Search failed - check authentication and simplify query',
        error as Error
      );
    }
  });
}

/**
 * Validate parameters for optimal research usage
 */
function validateSearchParameters(
  params: GitHubCodeSearchParams
): string | null {
  // Query validation
  if (!params.query.trim()) {
    return 'Empty query - provide search terms like "useState" or "api AND endpoint"';
  }

  if (params.query.length > 500) {
    return 'Query too long - limit to 500 characters for efficiency';
  }

  // Repository validation
  if (params.repo && !params.owner) {
    return 'Missing owner - use owner/repo format or provide both params';
  }

  // Boolean operator validation
  const invalidBooleans = params.query.match(/\b(and|or|not)\b/g);
  if (invalidBooleans) {
    return `Use uppercase: ${invalidBooleans.map(op => op.toUpperCase()).join(', ')}`;
  }

  // Unmatched quotes
  const quoteCount = (params.query.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    return 'Unmatched quotes - pair all quotes properly';
  }

  // Size parameter validation
  if (params.size && !/^[<>]=?\d+$|^\d+\.\.\d+$|^\d+$/.test(params.size)) {
    return 'Invalid size format - use ">100", "<50", "10..100"';
  }

  return null;
}
