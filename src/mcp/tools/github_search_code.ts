import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCodeSearchParams,
  GitHubCodeSearchItem,
  OptimizedCodeSearchResult,
} from '../../types';
import {
  createResult,
  simplifyRepoUrl,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `Search code across GitHub repositories using GitHub's legacy code search engine. Multi-word queries default to OR logic for better discoverability (e.g., "react fiber scheduler" becomes "react OR fiber OR scheduler"). Use quotes for exact phrases, explicit AND/OR/NOT for precise boolean logic. For best results, use specific filters (language, owner, filename) rather than complex boolean queries.`;

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
            'Search query (required). Multi-word queries default to OR logic for better discoverability (e.g., "react fiber scheduler" becomes "react OR fiber OR scheduler"). Use quotes for exact phrases ("exact phrase"), explicit AND/OR/NOT for precise boolean logic. Use filters for precision: language:python, owner:microsoft, filename:package.json'
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
        const codeResults: GitHubCodeSearchItem[] = JSON.parse(
          execResult.result
        );

        // GitHub CLI returns a direct array, not an object with total_count and items
        const items = Array.isArray(codeResults) ? codeResults : [];

        // Transform to optimized format
        const optimizedResult = transformToOptimizedFormat(
          items,
          args,
          execResult.command
        );

        return createResult({ data: optimizedResult });
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
 * Transform GitHub CLI response to optimized format
 */
function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[],
  params: GitHubCodeSearchParams,
  cliCommand: string
): OptimizedCodeSearchResult {
  const hasComplexBoolean = hasComplexBooleanLogic(params.query);
  const transformedQuery = parseSearchQuery(params.query);
  const wasTransformed = transformedQuery !== params.query;

  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  const optimizedItems = items.map(item => ({
    path: item.path,
    matches: item.textMatches.map(match => ({
      context: optimizeTextMatch(match.fragment, 80),
      positions: match.matches.map(m => m.indices as [number, number]),
    })),
    url: singleRepo ? item.path : simplifyGitHubUrl(item.url),
  }));

  const result: OptimizedCodeSearchResult = {
    query: params.query,
    total_count: items.length,
    items: optimizedItems,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: simplifyRepoUrl(singleRepo.url),
    };
  }

  // Add metadata for debugging and transparency
  if (hasComplexBoolean || items.length === 0 || wasTransformed) {
    result.metadata = {
      has_filters: !!(
        params.language ||
        params.owner ||
        params.filename ||
        params.extension
      ),
      search_scope: params.match
        ? Array.isArray(params.match)
          ? params.match.join(',')
          : params.match
        : 'file',
    };

    // Show transformation for transparency
    if (wasTransformed) {
      result.metadata.transformed_query = transformedQuery;
    }

    // Show CLI command for debugging when needed
    if (items.length === 0 && (hasComplexBoolean || wasTransformed)) {
      result.metadata.cli_command = cliCommand;
    }
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
 * Enhanced query parser that handles exact strings, boolean operators, and smart OR logic
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

  // Step 3: Check if explicit boolean operators are present
  const hasExplicitBoolean = /\b(AND|OR|NOT)\b/i.test(processedQuery);

  // Step 4: Smart OR logic for multi-word queries
  let searchQuery = processedQuery;

  if (!hasExplicitBoolean && !quotedMatches.length) {
    // Split on whitespace and create OR query for multiple terms
    const terms = processedQuery
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 0);

    if (terms.length > 1) {
      // Only apply OR logic if we have multiple meaningful terms
      // Avoid OR for very short terms that might be noise
      const meaningfulTerms = terms.filter(term => term.length >= 2);

      if (meaningfulTerms.length > 1) {
        // Join with OR and parenthesize for better precedence
        searchQuery = `(${meaningfulTerms.join(' OR ')})`;
      }
    }
  }

  // Step 5: Handle filters - ALL filters should use CLI flags for better reliability
  const githubFilters: string[] = [];

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
  // Check for explicit boolean operators (AND, OR, NOT)
  const hasExplicitBoolean = /\b(AND|OR|NOT)\b/i.test(query);

  // Check for nested parentheses or complex patterns
  const hasNestedLogic = /\([^)]*\b(AND|OR|NOT)\b[^)]*\)/i.test(query);

  // Check for negation patterns
  const hasNegation = /\bNOT\b/i.test(query);

  return hasExplicitBoolean || hasNestedLogic || hasNegation;
}

/**
 * Build command line arguments for GitHub CLI with improved parameter handling
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams) {
  const args = ['code'];

  // Parse and add the main search query
  const searchQuery = parseSearchQuery(params.query);

  // Always quote the search query to handle spaces and special characters properly
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
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

    if (params.owner) {
      const owners = Array.isArray(params.owner)
        ? params.owner
        : [params.owner];
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
    } else {
      // Handle repo without owner (must be in owner/repo format)
      repos.forEach(repo => {
        args.push(`--repo=${repo}`);
      });
    }
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
    return 'Empty query - provide search terms like "useState", "react fiber scheduler", or use filters (language, owner, filename)';
  }

  if (params.query.length > 1000) {
    return 'Query too long - limit to 1000 characters';
  }

  // Repository validation - allow owner/repo format in repo field
  if (params.repo && !params.owner) {
    const repoValues = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasOwnerFormat = repoValues.every(repo => repo.includes('/'));
    if (!hasOwnerFormat) {
      return 'Missing owner - format as owner/repo or provide both parameters';
    }
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
