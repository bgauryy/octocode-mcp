import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

// Define interfaces for the structured success result
interface GhCliRepository {
  fullName?: string;
  nameWithOwner?: string;
}

interface GhCliTextMatch {
  // Simple structure for counting matches
}

interface GhCliSearchCodeItem {
  path: string;
  repository: GhCliRepository;
  url: string;
  sha: string;
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
  total: number;
  results: GitHubSearchCodeResultItem[];
}

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `Find snippets of code from the codebase most relevant to the search query.

SEARCH OPTIMIZATION:
• Individual terms (AND logic): "scheduler workloop" finds code with BOTH terms
• Multiple strategies: try "lanes priority", "time slicing", "shouldYield" separately  
• Exact repo targeting: owner="facebook" repo="react" for focused searches
• Key file patterns: search specific files like "ReactFiberWorkLoop", "Scheduler.js"
• Language filtering more effective than query complexity

EXAMPLES FOR REACT CONCURRENT RENDERING:
• query="workloop" owner="facebook" repo="react" language="javascript"
• query="scheduler" owner="facebook" repo="react" 
• query="lanes" owner="facebook" repo="react"
• query="shouldYield" owner="facebook" repo="react"
• query="time slicing" owner="facebook" repo="react"

STRATEGIC APPROACH:
1. Start with simple terms in target repo
2. Try variations: "scheduler", "workloop", "concurrent", "lanes"
3. Check specific files: packages/scheduler, packages/react-reconciler
4. Use filename filters for key files

ANTI-PATTERNS:
❌ Complex phrases: "concurrent rendering scheduler implementation"
✅ Simple terms: "scheduler", "workloop" 
❌ Broad search without repo targeting
✅ Target specific repos: owner + repo parameters
❌ Over-specific terms → zero results
✅ Try multiple simple term combinations`;

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
            'Search query - USE INDIVIDUAL TERMS for best results. GitHub searches for ALL terms by default (AND logic). EFFECTIVE PATTERNS: (1) Individual terms: "useState hooks", "error handling", "api client" (finds files containing ALL these terms); (2) Exact phrases: "function component" (use quotes for exact matches); (3) OR logic: "fetch OR axios", "vue OR angular" (explicit OR for alternatives); (4) Function/variable names: "componentDidMount", "useState", "createContext"; (5) Exclusion: "react -test" (exclude test files). AVOID: Complex boolean expressions, too many terms. If zero results: try fewer terms, broader terms, single keywords, or remove quotes. Examples: "useState", "error handling", "fetch OR axios"'
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
            'Programming language filter. HIGHLY RECOMMENDED: Use instead of complex queries. Much more effective than adding "language:xxx" to query. Examples: "javascript", "typescript", "python", "go"'
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
            'File size filter in kilobytes. Examples: ">100", "<1000", "100..500".'
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
        const validationError = validateSearchParameters(args);
        if (validationError) {
          return createErrorResult(validationError);
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        // Parse the CLI response - the result is nested in the response
        let cliResponse: any;
        try {
          cliResponse = JSON.parse(result.content[0].text as string);
        } catch (parseError) {
          return createErrorResult(
            'Invalid CLI response format | Try: update GitHub CLI or check authentication',
            parseError as Error
          );
        }

        // The actual search results are in the `result` field
        let rawItems: GhCliSearchCodeItem[];
        try {
          rawItems = JSON.parse(cliResponse.result || '[]');
        } catch (parseError) {
          return createErrorResult(
            'Invalid JSON response from GitHub CLI | Try: update GitHub CLI or check authentication',
            parseError as Error
          );
        }

        const items = Array.isArray(rawItems) ? rawItems : [];

        const successData: GitHubSearchCodeSuccessData = {
          query: args.query,
          total: items.length,
          results: items.slice(0, args.limit || 20).map(
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
        return createErrorResult(
          'Code search failed | Try: check authentication, simplify query, or verify connection',
          error as Error
        );
      }
    }
  );
}

/**
 * Simplified query builder that doesn't over-engineer the CLI interaction
 */
function buildSearchQuery(
  query: string,
  filters: GitHubCodeSearchParams
): string {
  let searchQuery = query.trim();

  // Add path filter to query if provided (no CLI equivalent)
  if (filters.path) {
    searchQuery += ` path:${filters.path}`;
  }

  // Add visibility filter to query if provided (no CLI equivalent)
  if (filters.visibility) {
    searchQuery += ` visibility:${filters.visibility}`;
  }

  return searchQuery;
}

/**
 * Simplified CLI args builder
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams): string[] {
  const args = ['code'];

  // Add search query
  args.push(buildSearchQuery(params.query, params));

  // Add CLI flags for parameters that have CLI equivalents
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

  if (params.limit) {
    args.push(`--limit=${params.limit}`);
  }

  // Handle match parameter
  if (params.match) {
    const matchValue = Array.isArray(params.match)
      ? params.match[0]
      : params.match;
    args.push(`--match=${matchValue}`);
  }

  // Handle repository filters
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    repos.forEach(repoName => {
      if (repoName.includes('/')) {
        args.push(`--repo=${repoName}`);
      } else if (params.owner) {
        const owners = Array.isArray(params.owner)
          ? params.owner
          : [params.owner];
        owners.forEach(ownerName => {
          args.push(`--repo=${ownerName}/${repoName}`);
        });
      }
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(ownerName => {
      args.push(`--owner=${ownerName}`);
    });
  }

  // Always request JSON output
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

      return createErrorResult(
        'Search failed | Try: check authentication, simplify query, or verify connection',
        error as Error
      );
    }
  });
}

/**
 * Simplified parameter validation
 */
function validateSearchParameters(
  params: GitHubCodeSearchParams
): string | null {
  if (!params.query.trim()) {
    return 'Empty query - provide search terms like "useState", "import", or "error handling"';
  }

  if (params.query.length > 256) {
    return 'Query too long - limit to 256 characters for efficiency';
  }

  // Check if simple repo names are provided without owner
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasSimpleRepoName = repos.some(r => !r.includes('/'));
    if (hasSimpleRepoName && !params.owner) {
      return 'Owner parameter is required when repository name is specified without "owner/" prefix';
    }
  }

  // Check for unmatched quotes
  const quoteCount = (params.query.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    return 'Unmatched quotes - pair all quotes properly';
  }

  // Validate size parameter format
  if (params.size && !/^[<>]=?\d+$|^\d+\.\.\d+$|^\d+$/.test(params.size)) {
    return 'Invalid size format - use ">100", "<50", "10..100"';
  }

  return null;
}
