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
  createNoResultsError,
  getErrorWithSuggestion,
  SUGGESTIONS,
} from '../errorMessages';

export const GITHUB_SEARCH_CODE_TOOL_NAME = 'githubSearchCode';

const DESCRIPTION = `Search code across GitHub repositories using GitHub's code search API via GitHub CLI.

SEARCH STRATEGY FOR BEST RESULTS:

TERM OPTIMIZATION (IMPORTANT):
- BEST: Single terms for maximum coverage and relevance
- GOOD: 2 terms when you need both to be present  
- RESTRICTIVE: 3+ terms - very specific but may miss relevant results
- Example: "useState" (best coverage) vs "react hook useState" (specific but restrictive)

MULTI-SEARCH STRATEGY:
- Use SEPARATE searches for different aspects instead of complex single queries
- Example: Search "authentication" separately, then "login" separately
- Separate searches provide broader coverage than restrictive AND logic

Search Logic:
- Multiple terms = ALL must be present (AND logic) - very restrictive
- Single terms = maximum results and coverage
- Quoted phrases = exact phrase matching
- Mixed queries: "exact phrase" additional_term (phrase + term)

Quote Usage:
- Single terms: NO quotes (useState, authentication)
- Multi-word phrases: WITH quotes ("error handling", "user authentication")
- Mixed queries: "exact phrase" single_term another_term

Filter Usage:
- All filters use GitHub CLI flags (--language, --owner, --repo, etc.)
- Combine filters to narrow scope: language + owner, repo + filename
- Never use filters on exploratory searches - use to refine when too many results`;

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
            'Search query with AND logic between terms. OPTIMIZATION: Single terms give best coverage, 2 terms when both needed, 3+ terms very restrictive. Multiple words require ALL to be present. Use quotes for exact phrases. Examples: "useState" (best coverage), "error handling" (exact phrase), "react hook useState" (specific but restrictive).'
          ),

        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Uses --language CLI flag. Narrows search to specific language files. Use for language-specific searches.'
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s) to search within (e.g., "facebook", ["google", "microsoft"]). Uses --owner CLI flag for organization-wide search. Can be combined with repo parameter for specific repository search. Do NOT use owner/repo format - just the organization/username.'
          ),

        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter on specific repository(ies). Uses --repo CLI flag. Two usage patterns: (1) Use with owner parameter - provide just repo name (e.g., owner="facebook", repo="react" → --repo=facebook/react), or (2) Use alone - provide full "owner/repo" format (e.g., "facebook/react" → --repo=facebook/react).'
          ),

        filename: z
          .string()
          .optional()
          .describe(
            'Target specific filename or pattern. Uses --filename CLI flag. Use for file-specific searches.'
          ),

        extension: z
          .string()
          .optional()
          .describe(
            'File extension filter. Uses --extension CLI flag. Alternative to language parameter.'
          ),

        match: z
          .enum(['file', 'path'])
          .optional()
          .describe(
            'Search scope: "file" for file content (default), "path" for filenames/paths. Uses --match CLI flag. Single value only - multiple scopes not supported by GitHub CLI.'
          ),

        size: z
          .string()
          .regex(
            /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
            'Invalid size format. Use: ">10", ">=5", "<100", "<=50", "10..100", or exact number "50"'
          )
          .optional()
          .describe(
            'File size filter in KB. Uses --size CLI flag. Format: ">N" (larger than), "<N" (smaller than), "N..M" (range), "N" (exact).'
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
 * Handles various search errors and returns a formatted CallToolResult with smart fallbacks.
 */
function handleSearchError(errorMessage: string): CallToolResult {
  // Rate limit with smart timing guidance
  if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
    return createResult({
      error: `GitHub API rate limit reached. Try again in 5-10 minutes, or use these strategies:
• Search fewer terms per query
• Use owner/repo filters to narrow scope
• Try npm package search for package-related queries
• Use separate searches instead of complex queries`,
    });
  }

  // Authentication with clear next steps
  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return createResult({
      error: `GitHub authentication required. Fix with:
1. Run: gh auth login
2. Verify access: gh auth status
3. For private repos: use api_status_check to verify org access`,
    });
  }

  // Network/timeout with fallback suggestions
  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return createResult({
      error: `Network timeout. Try these alternatives:
• Reduce search scope with owner or language filters
• Use github_search_repos to find repositories first
• Try npm package search for package discovery
• Check network connection and retry`,
    });
  }

  // Invalid query with specific fixes
  if (
    errorMessage.includes('validation failed') ||
    errorMessage.includes('Invalid query')
  ) {
    return createResult({
      error: `Invalid search query. Common fixes:
• Remove special characters: ()[]{}*?^$|.\\
• Use quotes only for exact phrases: "error handling"
• Avoid escaped quotes: use term instead of "term"
• Try broader terms: "react" instead of "React.Component"`,
    });
  }

  // Repository not found with discovery suggestions
  if (
    errorMessage.includes('repository not found') ||
    errorMessage.includes('owner not found')
  ) {
    return createResult({
      error: `Repository/owner not found. Discovery strategies:
• Use github_search_repos to find correct names
• Check for typos in owner/repo names
• Try without owner filter for broader search
• Use npm package search if looking for packages`,
    });
  }

  // JSON parsing with system guidance
  if (errorMessage.includes('JSON')) {
    return createResult({
      error: `GitHub CLI response parsing failed. System issue - try:
• Update GitHub CLI: gh extension upgrade
• Retry in a few moments
• Use github_search_repos as alternative
• Check gh auth status for authentication`,
    });
  }

  // Generic fallback with progressive strategy
  return createResult({
    error: `Code search failed: ${errorMessage}

Progressive recovery strategy:
1. Try broader search terms
2. Use github_search_repos to find repositories
3. Use npm package search for package-related queries
4. Check github CLI status: gh auth status`,
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
 * Build command line arguments for GitHub CLI following the exact CLI format.
 * Uses proper flags (--flag=value) instead of qualifiers where appropriate.
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const args: string[] = ['code'];

  // Parse query to preserve quoted phrases and extract qualifiers
  const { searchQuery, extractedQualifiers } = parseSearchQuery(params.query);

  // Add the main search query if present
  if (searchQuery) {
    args.push(searchQuery);
  }

  // Add extracted qualifiers from the query (these should remain as qualifiers)
  extractedQualifiers.forEach(qualifier => {
    args.push(qualifier);
  });

  // Add explicit parameters as CLI flags (following GitHub CLI format)
  if (params.language && !params.query.includes('language:')) {
    args.push(`--language=${params.language}`);
  }

  // Handle owner and repo parameters properly
  if (params.repo && !params.query.includes('repo:')) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    repos.forEach(repo => {
      // If both owner and repo are provided, combine them for --repo flag
      if (params.owner && !repo.includes('/')) {
        const owners = Array.isArray(params.owner)
          ? params.owner
          : [params.owner];
        owners.forEach(owner => args.push(`--repo=${owner}/${repo}`));
      } else {
        // Repo is already in owner/repo format or no owner provided
        args.push(`--repo=${repo}`);
      }
    });
  } else if (
    params.owner &&
    !params.query.includes('org:') &&
    !params.query.includes('user:')
  ) {
    // Only owner provided, no repo - use --owner flag for organization-wide search
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => args.push(`--owner=${owner}`));
  }

  if (params.filename && !params.query.includes('filename:')) {
    args.push(`--filename=${params.filename}`);
  }

  if (params.extension && !params.query.includes('extension:')) {
    args.push(`--extension=${params.extension}`);
  }

  if (params.size && !params.query.includes('size:')) {
    args.push(`--size=${params.size}`);
  }

  // Handle match parameter - use --match flag
  if (params.match) {
    args.push(`--match=${params.match}`);
  }

  // Add limit flag
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
      return handleSearchError(errorMessage);
    }
  });
}

/**
 * Parse search query to preserve quoted phrases and extract qualifiers.
 * Handles:
 * - Quoted phrases: "error handling" -> kept as single unit
 * - Multiple terms: react lifecycle -> both terms for AND search
 * - Mixed: "error handling" debug -> phrase + term
 * - Qualifiers: language:javascript -> extracted separately
 * - Quote escaping issues: automatically fixes common mistakes
 */
function parseSearchQuery(query: string): {
  searchQuery: string;
  extractedQualifiers: string[];
} {
  const qualifiers: string[] = [];
  const searchTerms: string[] = [];

  // Clean up common quote escaping issues
  let cleanedQuery = query;

  // Fix escaped quotes that shouldn't be escaped
  if (cleanedQuery.includes('\\"') && !cleanedQuery.includes(' ')) {
    cleanedQuery = cleanedQuery.replace(/\\"/g, '');
  }

  // Fix single-word queries wrapped in quotes unnecessarily
  if (
    cleanedQuery.startsWith('"') &&
    cleanedQuery.endsWith('"') &&
    !cleanedQuery.slice(1, -1).includes(' ')
  ) {
    cleanedQuery = cleanedQuery.slice(1, -1);
  }

  // Regular expression to match quoted strings or individual words/qualifiers
  const tokenRegex = /"([^"]+)"|([^\s]+)/g;
  let match;

  while ((match = tokenRegex.exec(cleanedQuery)) !== null) {
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
