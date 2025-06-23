import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchParams } from '../../types';
import { createResult } from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `Search code across GitHub repositories using GitHub's legacy code search engine. Boolean logic has limitations: simple OR queries work well, complex NOT operations may fail. For best results, use specific filters (language, owner, filename) rather than complex boolean queries.`;

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
            'Search query (required). Simple terms and basic OR logic work best. Complex boolean (NOT, nested operations) may fail due to legacy search engine. Use filters for precision: language:python, owner:microsoft, filename:package.json'
          ),

        // REPOSITORY FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization filter. Use for targeted searches or private repo access.'
          ),
        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Specific repositories in "owner/repo" format. Can be array for multiple repos.'
          ),

        // FILE TYPE FILTERS (GitHub CLI flags)
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter (javascript, python, typescript). Highly effective for targeted searches.'
          ),
        extension: z
          .string()
          .optional()
          .describe(
            'File extension without dot (js, py, ts). Precise file type targeting.'
          ),
        filename: z
          .string()
          .optional()
          .describe(
            'Exact filename filter (package.json, Dockerfile). Perfect for config files.'
          ),
        size: z
          .string()
          .optional()
          .describe(
            'File size filter with operators (">100", "<50", "10..100"). Size in kilobytes.'
          ),

        // SEARCH SCOPE (GitHub CLI flags)
        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            'Search scope: "file" for code content, "path" for filenames, or both.'
          ),

        // PAGINATION
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            'Maximum results (1-100, default: 30). Note: GitHub CLI default is 30.'
          ),
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
          return createResult({ error: validationError });
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        const execResult = JSON.parse(result.content[0].text as string);
        const codeResults = JSON.parse(execResult.result);

        // GitHub CLI returns a direct array, not an object with total_count and items
        const items = Array.isArray(codeResults) ? codeResults : [];

        const hasComplex = hasComplexBooleanLogic(args.query);
        const responseData = {
          query: args.query,
          processed_query: parseSearchQuery(args.query),
          total_count: items.length,
          items: items,
          cli_command: execResult.command,
          debug_info: {
            has_complex_boolean_logic: hasComplex,
            escaped_args: buildGitHubCliArgs(args),
            original_query: args.query,
            ...(items.length === 0 &&
              hasComplex && {
                suggestion:
                  'Zero results with complex boolean query. Try: 1) Simpler OR logic, 2) Use filters instead (language, owner, filename), 3) Single search terms',
              }),
          },
        };

        return createResult({ data: responseData });
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // Handle JSON parsing errors
        if (errorMessage.includes('JSON')) {
          return createResult({
            error:
              'GitHub CLI returned invalid response - check if GitHub CLI is up to date with "gh version" and try again',
          });
        }

        return createResult({
          error: 'GitHub code search failed',
          suggestions: [
            'Try simpler queries without NOT operators',
            'Use filters (language, owner, filename) instead of complex boolean',
            'Check authentication with api_status_check',
          ],
        });
      }
    }
  );
}

/**
 * Enhanced query parser that handles exact strings, boolean operators, and filters
 */
function parseSearchQuery(query: string) {
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

  // Step 4: Smart boolean logic - REMOVED auto-OR logic to preserve exact phrase matching
  // This was causing issues where "error handling" became "error OR handling"
  // GitHub search is smart enough to handle multi-word queries properly
  let searchQuery = processedQuery;

  // Step 5: Handle filters - ALL filters should use CLI flags for better reliability
  // Adding filters to query string causes parsing issues and conflicts
  const githubFilters: string[] = [];

  // Only add specific filters to query string if absolutely necessary
  // For most cases, CLI flags provide better validation and performance
  if (originalHasComplexLogic) {
    // For complex boolean queries, we still prefer CLI flags over query string filters
    // This avoids parsing issues and provides better error messages
  }

  // Step 6: Combine query with GitHub filters (currently empty for better CLI compatibility)
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
  const searchQuery = parseSearchQuery(params.query);
  args.push(searchQuery);

  // Always use CLI flags for all parameters for better reliability and validation
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
        return createResult({
          error: 'GitHub authentication required - run api_status_check tool',
        });
      }

      if (errorMessage.includes('rate limit')) {
        return createResult({
          error:
            'GitHub rate limit exceeded - use more specific filters or wait',
        });
      }

      if (
        errorMessage.includes('validation failed') ||
        errorMessage.includes('Invalid query')
      ) {
        return createResult({
          error:
            'Invalid query syntax. GitHub legacy search has limitations: avoid complex NOT logic, use simple OR patterns, prefer filters over complex boolean. Try: "react OR vue" instead of complex nested queries',
        });
      }

      if (
        errorMessage.includes('repository not found') ||
        errorMessage.includes('owner not found')
      ) {
        return createResult({
          error:
            'Repository not found - verify owner/repo names and permissions',
        });
      }

      if (errorMessage.includes('timeout')) {
        return createResult({
          error: 'Search timeout - add filters to narrow results',
        });
      }

      // Generic fallback with helpful guidance
      return createResult({
        error: 'Code search failed - check authentication and simplify query',
      });
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
    return 'Empty query - provide search terms like "useState", "react OR vue", or use filters (language, owner, filename)';
  }

  if (params.query.length > 1000) {
    return 'Query too long - limit to 1000 characters';
  }

  // Repository validation
  if (params.repo && !params.owner) {
    return 'Missing owner - format as owner/repo or provide both parameters';
  }

  // Invalid characters in query
  if (params.query.includes('\\') && !params.query.includes('\\"')) {
    return 'Invalid escapes - use quotes for exact phrases instead';
  }

  // Boolean operator validation
  const invalidBooleans = params.query.match(/\b(and|or|not)\b/g);
  if (invalidBooleans) {
    return `Boolean operators must be uppercase: ${invalidBooleans.map(op => op.toUpperCase()).join(', ')}`;
  }

  // Unmatched quotes
  const quoteCount = (params.query.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    return 'Unmatched quotes - ensure all quotes are properly paired';
  }

  // Size parameter validation
  if (params.size && !/^[<>]=?\d+$|^\d+\.\.\d+$|^\d+$/.test(params.size)) {
    return 'Invalid size format - use ">100", "<50", "10..100", or "100"';
  }

  return null; // No validation errors
}
