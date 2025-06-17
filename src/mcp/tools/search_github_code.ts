//LEGACY - https://docs.github.com/en/search-github/searching-on-github/searching-code
// GitHub CLI uses LEGACY code search API - different from new web search
// Docs: https://docs.github.com/en/search-github/searching-on-github/searching-code
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

/**
 * Registers the GitHub Code Search tool with the MCP server.
 *
 * This tool provides semantic code search across GitHub repositories using the GitHub CLI.
 * It supports advanced search features like boolean operators, qualifiers, and filters.
 *
 * Key features:
 * - Smart query optimization (automatic AND insertion for multi-term queries)
 * - Boolean operator support (AND, OR, NOT)
 * - GitHub qualifier support (language:, path:, etc.)
 * - Repository, owner, and organization filtering
 * - File type and size filtering
 */
export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    {
      // Core search query - required parameter
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'GitHub legacy search query. REQUIRED: search terms + qualifiers. Format: "search terms" language:javascript path:src repo:owner/name. Cannot use qualifiers alone. No parentheses support. NOTE: Use separate parameters (language, owner, etc.) instead of inline qualifiers to avoid parsing issues.'
        ),

      // Repository and ownership filters
      owner: z
        .string()
        .optional()
        .describe(
          'Repository owner/org: "facebook", "microsoft", "google". Leave empty for global search across all GitHub.'
        ),
      repo: z
        .array(z.string())
        .optional()
        .describe(
          'Specific repositories: ["react", "vue"] or ["cli"]. Requires owner parameter.'
        ),
      user: z
        .string()
        .optional()
        .describe('Personal GitHub account: "octocat", "torvalds"'),
      org: z
        .string()
        .optional()
        .describe('GitHub organization: "github", "microsoft", "google"'),

      // File and content filters
      extension: z
        .string()
        .optional()
        .describe(
          'File extension filter: "js", "ts", "py", "rs", "go", "java"'
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Exact filename: "package.json", "Dockerfile", "README.md", "main.py"'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Programming language: "javascript", "typescript", "python", "rust", "go", "java"'
        ),
      path: z
        .string()
        .optional()
        .describe(
          'Directory path: "src", "lib", "docs". Searches in directory and subdirectories. Use path:/ for root only.'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'File size filter in KB: ">10" (larger than), "<100" (smaller than), "50..200" (range)'
        ),

      // Search behavior controls
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(30)
        .describe(
          'Maximum results to return (default: 30, max: 50 for performance)'
        ),
      match: z
        .enum(['file', 'path'])
        .optional()
        .describe(
          'Search scope: "file" for content only, "path" for paths only. Default: both.'
        ),
      enableQueryOptimization: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'Auto-enhance simple queries with AND operators (default: true, recommended)'
        ),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (
      args: GitHubCodeSearchParams & {
        enableQueryOptimization?: boolean;
      }
    ) => {
      try {
        // Validate repository dependencies
        if (args.repo && !args.owner) {
          return {
            content: [
              {
                type: 'text',
                text: 'Repository name requires owner parameter.',
              },
            ],
            isError: true,
          };
        }

        // Apply simple query optimization if enabled
        // This only handles basic multi-term queries by adding explicit AND operators
        // More complex processing (boolean operators, qualifiers) is handled in the implementation
        const finalQuery =
          args.enableQueryOptimization !== false
            ? optimizeSimpleQuery(args.query)
            : args.query;

        // Execute search with optimized query
        const result = await searchGitHubCode({ ...args, query: finalQuery });
        return result;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Optimizes simple search queries by adding explicit AND operators between terms.
 *
 * This function only enhances basic multi-term queries to improve search precision.
 * It preserves advanced syntax like boolean operators, qualifiers, regex, and quoted phrases.
 *
 * Examples:
 * - "react hooks" → "react AND hooks"
 * - "function useState" → "function AND useState"
 * - "async OR await" → "async OR await" (unchanged - has boolean operator)
 * - "language:javascript test" → "language:javascript test" (unchanged - has qualifier)
 *
 * @param query - The original search query
 * @returns The optimized query with explicit AND operators for simple multi-term queries
 */
function optimizeSimpleQuery(query: string): string {
  // Preserve advanced syntax: boolean operators, qualifiers, regex, quoted phrases
  // This regex detects:
  // - Boolean operators: AND, OR, NOT
  // - Regex patterns: /pattern/
  // - GitHub qualifiers: word:value
  // - Quoted phrases: "exact phrase"
  if (/\b(?:OR|AND|NOT)\b|\/.*\/|\w+:|".*"/.test(query)) {
    return query; // Advanced syntax detected - use as-is
  }

  // Split query into individual terms, filtering out empty strings
  const terms = query.trim().split(/\s+/).filter(Boolean);

  // Single term or empty query - no optimization needed
  if (terms.length <= 1) {
    return query;
  }

  // Multiple simple terms - make AND explicit for search precision
  // This helps GitHub understand we want all terms present, not just any term
  return terms.join(' AND ');
}
