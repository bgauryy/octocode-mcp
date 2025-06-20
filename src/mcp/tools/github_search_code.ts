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

const DESCRIPTION = `Search code across GitHub repositories using strategic boolean operators and filters usign "gh code search" command.

STRATEGIC SEARCH PATTERNS:

 OR LOGIC (Exploratory Discovery):
• Auto-applied to multi-word queries: "useState hook" → "useState OR hook"
• Best for: Learning, finding alternatives, casting wide nets
• Scope: BROADEST - finds files with ANY of the terms

AND LOGIC (Precise Intersection):
• Explicit requirement: "react AND hooks" requires BOTH terms present
• Best for: Finding specific combinations, technology intersections
• Scope: RESTRICTIVE - only files containing ALL terms

EXACT PHRASE (Laser Targeting):
• Escaped quotes: "useState hook" finds literal "useState hook" sequence
• Best for: Documentation titles, specific API calls, exact implementations
• Scope: MOST PRECISE - only exact sequence matches

NOT LOGIC (Noise Filtering):
• Exclude unwanted results: "authentication NOT test NOT mock"
• Best for: Removing examples, tests, deprecated code

RESTRICTIVENESS SCALE: OR < AND < Exact Phrase (Broadest → Most Precise)

COMBINE FILTERS: Mix query with language, owner, path filters for laser-focused results.`;

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
        if (args.repo && !args.owner) {
          return createResult(
            'Repository search requires owner parameter - specify owner when searching specific repositories',
            true
          );
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
        return createErrorResult(
          'GitHub code search failed - check repository access or simplify query',
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

  // Step 3: Smart boolean logic - default to OR between terms if no explicit operators
  let searchQuery = processedQuery;

  // Check if query already has explicit boolean operators
  if (!hasComplexBooleanLogic(processedQuery)) {
    // Split by whitespace and join with OR for better search results
    const terms = processedQuery
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 0);
    if (terms.length > 1) {
      searchQuery = terms.join(' OR ');
    }
  }

  // Step 4: Add GitHub-specific filters that go in the query string
  const githubFilters: string[] = [];

  if (filters.path) {
    githubFilters.push(`path:${filters.path}`);
  }

  if (filters.visibility) {
    githubFilters.push(`visibility:${filters.visibility}`);
  }

  // For complex boolean queries, add language/extension/filename/size to query string
  const hasComplexLogic = hasComplexBooleanLogic(searchQuery);
  if (hasComplexLogic) {
    if (filters.language) {
      githubFilters.push(`language:${filters.language}`);
    }

    if (filters.extension) {
      githubFilters.push(`extension:${filters.extension}`);
    }

    if (filters.filename) {
      githubFilters.push(`filename:${filters.filename}`);
    }

    if (filters.size) {
      githubFilters.push(`size:${filters.size}`);
    }
  }

  // Step 5: Combine query with GitHub filters
  if (githubFilters.length > 0) {
    searchQuery = `${searchQuery} ${githubFilters.join(' ')}`;
  }

  // Step 6: Restore exact phrases
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
 * Build command line arguments for GitHub CLI
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams) {
  const args = ['code'];

  // Parse and add the main search query
  const searchQuery = parseSearchQuery(params.query, params);
  args.push(searchQuery);

  // Add CLI flags - Always add basic flags, but be careful with complex boolean queries
  const hasComplexLogic = hasComplexBooleanLogic(searchQuery);

  // For complex boolean queries, add filters to the query string instead of CLI flags
  if (hasComplexLogic) {
    // Complex boolean queries: filters go in query string, handled by parseSearchQuery
    // Note: Complex boolean logic detected, filters added to query string
  } else {
    // Simple queries: use CLI flags for better performance
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

  if (params.limit) {
    args.push(`--limit=${params.limit}`);
  }

  // Handle match parameter - can be string or array
  if (params.match) {
    const matchValues = Array.isArray(params.match)
      ? params.match
      : [params.match];
    // GitHub API limitation: can't use both in:file and in:path in same query
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

  // Handle repository filters
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
      return createErrorResult(
        'Code search command failed - verify GitHub CLI is authenticated',
        error as Error
      );
    }
  });
}
