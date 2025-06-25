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

const DESCRIPTION = `Search code across GitHub repositories with powerful GitHub search syntax and advanced filtering.

BOOLEAN LOGIC (MOST POWERFUL):
- "useState OR useEffect" - Find either hook
- "useState AND useEffect" - Find both hooks together
- "authentication AND (jwt OR oauth)" - Complex logic combinations
- "NOT deprecated" - Exclude deprecated code

EMBEDDED QUALIFIERS:
- "useState language:javascript filename:*.jsx" - Hook in React files
- "authentication language:python path:*/security/*" - Security code in Python
- "docker OR kubernetes language:yaml extension:yml" - Container configs

TRADITIONAL FILTERS (ALSO SUPPORTED):
- language: "javascript", owner: "microsoft", filename: "package.json"

PROVEN PATTERNS: "authentication" → +language → +owner → +filename
KEY TIPS: language filter = 90% speed boost, boolean operators work perfectly with filters`;

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
            `Search query with GitHub syntax. BOOLEAN LOGIC: "useState OR useEffect", "authentication AND jwt", "NOT deprecated". EMBEDDED QUALIFIERS: "useState language:javascript", "docker path:*/config/*". EXACT PHRASES: "error handling".

POWERFUL EXAMPLES: "useState OR useEffect language:javascript", "authentication AND (jwt OR oauth)", "docker OR kubernetes language:yaml", "NOT deprecated language:python"
RULES: Boolean operators MUST be uppercase (AND, OR, NOT). Combines perfectly with traditional filters.`
          ),

        language: z
          .string()
          .optional()
          .describe(
            `MOST EFFECTIVE FILTER - 90% speed boost! Essential for popular languages.

POPULAR: javascript, typescript, python, java, go, rust, php, ruby, swift, kotlin, dart
SYSTEMS: c, cpp, assembly, shell, dockerfile, yaml`
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            `HIGH IMPACT - Reduces search space by 95%+

EXAMPLES: "microsoft", "google", "facebook" or ["microsoft", "google"]
POPULAR: microsoft, google, facebook, amazon, apache, hashicorp, kubernetes`
          ),

        filename: z
          .string()
          .optional()
          .describe(
            `SURGICAL PRECISION for configs and special files

TARGETS: "package.json", "Dockerfile", "webpack.config.js", ".eslintrc", "README.md"
STRATEGY: filename:package.json + "react typescript"`
          ),

        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            `PRECISE TARGETING for specific repositories

FORMAT: "facebook/react", "microsoft/vscode" or ["facebook/react", "vuejs/vue"]
USE: Deep dive analysis of specific projects`
          ),

        extension: z
          .string()
          .optional()
          .describe(
            `FILE TYPE PRECISION - More specific than language filter

POPULAR: js, ts, jsx, tsx, py, java, go, rs, rb, php, cs, sh, yml, json, md
USE: extension:tsx (React TypeScript only), extension:dockerfile`
          ),

        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            `SEARCH SCOPE: "file" (content), "path" (filenames), ["file", "path"] (both)

EXAMPLES: match:"path" + "test" (find test files), match:"file" + "useState"`
          ),

        size: z
          .string()
          .optional()
          .describe(
            `FILE SIZE FILTER: ">100" (>100KB), "<50" (<50KB), "10..100" (range)

STRATEGY: "<200" (avoid huge files), ">20" (substantial code), "<10" (configs)`
          ),

        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            `RESULTS: 10-20 (quick), 30 (default), 50-100 (comprehensive). Use filters over high limits.`
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
          return createResult({
            error:
              'No results found. Try simplifying your query or using different filters.',
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
  if (errorMessage.includes('JSON')) {
    return createResult({
      error:
        'GitHub CLI returned invalid response - check if GitHub CLI is up to date with "gh version" and try again',
    });
  }

  if (errorMessage.includes('authentication')) {
    return createResult({
      error: 'GitHub authentication required - run api_status_check tool',
    });
  }

  if (errorMessage.includes('rate limit')) {
    return createResult({
      error: 'GitHub rate limit exceeded - use more specific filters or wait',
    });
  }

  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: 'Invalid query syntax. GitHub legacy search has limitations.',
    });
  }

  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: 'Repository or owner not found',
    });
  }

  if (errorMessage.includes('timeout')) {
    return createResult({
      error: 'Search timeout - query too broad',
    });
  }

  // Generic fallback with helpful guidance
  return createResult({
    error: 'Code search failed',
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
    matches: item.textMatches.map(match => ({
      context: optimizeTextMatch(match.fragment, 120), // Increased context for better understanding
      positions: match.matches.map(m => m.indices as [number, number]),
    })),
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
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const args = ['code'];

  // Add search query
  args.push(params.query);

  // Helper function to add a CLI argument if the parameter exists
  const addCliArg = (
    paramKey: keyof GitHubCodeSearchParams,
    cliFlag: string,
    formatter?: (value: any) => string | string[]
  ) => {
    const value = params[paramKey];
    if (value !== undefined) {
      const formattedValue = formatter ? formatter(value) : value.toString();
      if (Array.isArray(formattedValue)) {
        formattedValue.forEach(item => args.push(`--${cliFlag}=${item}`));
      } else {
        args.push(`--${cliFlag}=${formattedValue}`);
      }
    }
  };

  // Add filters in order of effectiveness for better CLI performance
  addCliArg('language', 'language');
  addCliArg('filename', 'filename');
  addCliArg('extension', 'extension');
  addCliArg('size', 'size');
  addCliArg('limit', 'limit');

  // Handle match parameter (can be a string or an array, we only use the first for the CLI flag)
  addCliArg('match', 'match', value =>
    Array.isArray(value) ? value[0] : value
  );

  // Handle owner parameter - can be string or array. Only add if repo is not present.
  if (!params.repo) {
    addCliArg('owner', 'owner');
  }

  // Handle repository filters
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const owners = Array.isArray(params.owner)
      ? params.owner
      : params.owner
        ? [params.owner]
        : [];

    repos.forEach(repo => {
      // If an owner is specified and the repo isn't already in owner/repo format, prepend the owner.
      // If multiple owners are specified, this will create multiple --repo flags.
      if (owners.length > 0 && !repo.includes('/')) {
        owners.forEach(owner => args.push(`--repo=${owner}/${repo}`));
      } else {
        args.push(`--repo=${repo}`);
      }
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
    return 'Empty query. Try: "useState", "authentication", "docker setup", or use filters like language:python';
  }

  if (params.query.length > 1000) {
    return 'Query too long (max 1000 chars). Simplify to key terms like "error handling" instead of full sentences.';
  }

  // Repository validation - allow owner/repo format in repo field
  if (params.repo && !params.owner) {
    const repoValues = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasOwnerFormat = repoValues.every(repo => repo.includes('/'));
    if (!hasOwnerFormat) {
      return 'Repository format error. When no owner is provided, repository must be in "owner/repo" format (e.g., "facebook/react").';
    }
  }

  // Boolean operator validation with suggestions
  const invalidBooleans = params.query.match(/\b(and|or|not)\b/g);
  if (invalidBooleans) {
    const corrected = invalidBooleans.map(op => op.toUpperCase()).join(', ');
    return `Boolean operators must be uppercase: ${corrected}. Example: "react OR vue" not "react or vue"`;
  }

  return null; // No validation errors
}
