import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

// Define interfaces for the structured success result
interface GhCliRepository {
  // Define only fields that are actually used or potentially available and useful
  fullName?: string; // Typically from REST API, less common in CLI --json
  nameWithOwner?: string; // Common in gh CLI --json output
  // id?: string;
  // name?: string;
  // owner?: { login?: string; id?: string; type?: string };
  // visibility?: string;
  // etc.
}

interface GhCliTextMatch {
  // Structure of individual text match, if needed for 'matches' count or details
  // For now, we only use .length, so a complex type isn't strictly necessary here
  // fragment?: string;
  // property?: string;
  // matches?: { text?: string; indices?: number[] }[];
}

interface GhCliSearchCodeItem {
  path: string;
  repository: GhCliRepository;
  url: string;
  sha: string; // Available from --json, though not used in current simplified output
  textMatches?: GhCliTextMatch[];
}

interface GitHubSearchCodeResultItem {
  file: string;
  repository: string;
  url: string;
  matches: number;
}

interface GitHubSearchCodeSuccessData {
  query: string;
  total: number; // Total items returned by the CLI call (respecting its limit)
  results: GitHubSearchCodeResultItem[];
}

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
            'Target organization/user from api_status_check results. Use for focused searches within your accessible repositories.'
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
            'File size filter in kilobytes. Examples: ">100", "<1000", "100..500" (kilobytes).'
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
          return createErrorResult(validationError);
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        // Assuming result.content[0].text is the direct JSON string (array) from gh CLI
        let rawItems: GhCliSearchCodeItem[];
        try {
          rawItems = JSON.parse(result.content[0].text as string);
        } catch (parseError) {
          // Handle cases where the output isn't valid JSON as expected
          return createErrorResult(
            'Invalid JSON response from GitHub CLI | Try: update GitHub CLI, check installation, or verify output format',
            parseError as Error
          );
        }

        const items = Array.isArray(rawItems) ? rawItems : [];

        const successData: GitHubSearchCodeSuccessData = {
          query: args.query,
          total: items.length, // This is the count of items received from the CLI
          results: items
            .slice(0, args.limit || 20) // Apply tool-defined limit if different from CLI's
            .map(
              (item: GhCliSearchCodeItem): GitHubSearchCodeResultItem => ({
                file: item.path || '',
                repository:
                  item.repository?.nameWithOwner ||
                  item.repository?.fullName ||
                  '',
                url: item.url || '',
                matches: item.textMatches?.length || 0,
              })
            ),
        };
        return createSuccessResult(successData);
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // Handle JSON parsing errors
        if (errorMessage.includes('JSON')) {
          return createErrorResult(
            'Invalid CLI response | Try: update GitHub CLI, check authentication, or verify installation',
            error as Error
          );
        }

        return createErrorResult(
          'Code search failed | Try: simplify query, add filters, or check authentication',
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

  // Refined handling for owner and repo parameters
  const cliRepoArgs: string[] = [];
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const owners = params.owner
      ? Array.isArray(params.owner)
        ? params.owner
        : [params.owner]
      : null;

    repos.forEach(repoName => {
      if (repoName.includes('/')) {
        cliRepoArgs.push(`--repo=${repoName}`);
      } else if (owners) {
        owners.forEach(ownerName => {
          cliRepoArgs.push(`--repo=${ownerName}/${repoName}`);
        });
      }
      // If repoName doesn't include '/' and owners is null, validation should have caught this.
    });
  } else if (params.owner) {
    // Only owner is specified, no specific repo
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(ownerName => {
      args.push(`--owner=${ownerName}`);
    });
  }
  args.push(...cliRepoArgs);

  // JSON output with all available fields from CLI help
  // The CLI help lists: path, repository, sha, textMatches, url
  args.push('--json=path,repository,sha,textMatches,url');

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
          'Authentication required | Try: run api_status_check tool or verify GitHub CLI login',
          error as Error
        );
      }

      if (errorMessage.includes('rate limit')) {
        return createErrorResult(
          'Rate limit exceeded | Try: add specific filters, wait, or use narrower search scope',
          error as Error
        );
      }

      if (
        errorMessage.includes('validation failed') ||
        errorMessage.includes('Invalid query')
      ) {
        return createErrorResult(
          'Invalid query syntax | Try: check operators, fix quotes, or simplify search terms',
          error as Error
        );
      }

      if (
        errorMessage.includes('repository not found') ||
        errorMessage.includes('owner not found')
      ) {
        return createErrorResult(
          'Repository not found | Try: verify names, check permissions, or confirm repository exists',
          error as Error
        );
      }

      if (errorMessage.includes('timeout')) {
        return createErrorResult(
          'Search timeout | Try: add filters, narrow scope, or use more specific terms',
          error as Error
        );
      }

      // Generic fallback
      return createErrorResult(
        'Search failed | Try: check authentication, simplify query, or verify connection',
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

  if (params.query.length > 256) {
    return 'Query too long - limit to 256 characters for efficiency';
  }

  // Repository validation
  if (params.repo && !params.owner) {
    // This validation is a bit tricky. If 'repo' is 'owner/repo', owner is not strictly needed.
    // However, if 'repo' is just 'reponame', then owner IS needed.
    // The refined validation below handles this.
    // return 'Missing owner - use owner/repo format or provide both params';
  }

  // Repository validation: If repo is specified and any repo name is simple (no '/'), owner is required.
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasSimpleRepoName = repos.some(r => !r.includes('/'));
    if (hasSimpleRepoName && !params.owner) {
      return 'Owner parameter is required if any repository name is specified without an "owner/" prefix.';
    }
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
