//LEGACY - https://docs.github.com/en/search-github/searching-on-github/searching-code
// GitHub CLI uses LEGACY code search API - different from new web search
// Docs: https://docs.github.com/en/search-github/searching-on-github/searching-code
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    {
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'GitHub legacy search query. REQUIRED: search terms + qualifiers. Format: "search terms" language:javascript path:src repo:owner/name. Cannot use qualifiers alone. No parentheses support.'
        ),
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
      user: z
        .string()
        .optional()
        .describe('Personal GitHub account: "octocat", "torvalds"'),
      org: z
        .string()
        .optional()
        .describe('GitHub organization: "github", "microsoft", "google"'),
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
      size: z
        .string()
        .optional()
        .describe(
          'File size filter in KB: ">10" (larger than), "<100" (smaller than), "50..200" (range)'
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
        // Simple validation
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

        // Enhance query if optimization enabled
        const finalQuery =
          args.enableQueryOptimization !== false
            ? enhanceQuery(args.query)
            : args.query;

        // Direct search - no complex loops or variations
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

// Smart query enhancement following GitHub search best practices
function enhanceQuery(query: string): string {
  // Preserve advanced syntax: boolean operators, qualifiers, regex, quoted phrases
  if (/\b(?:OR|AND|NOT)\b|\/.*\/|\w+:|".*"/.test(query)) {
    return query; // Advanced syntax detected - use as-is
  }

  // For simple multi-term queries, add explicit AND for precision
  const terms = query.trim().split(/\s+/).filter(Boolean);

  // Single term or empty - keep simple
  if (terms.length <= 1) {
    return query;
  }

  // Multiple terms - make AND explicit for clarity and precision
  return terms.join(' AND ');
}
