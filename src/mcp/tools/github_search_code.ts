import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';
import { createResult, parseJsonResponse } from '../../impl/util';

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
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'Search terms with optional qualifiers. Use separate parameters for owner/language to avoid parsing issues.'
        ),

      owner: z
        .string()
        .optional()
        .describe('Repository owner/org. Leave empty for global search.'),
      repo: z
        .array(z.string())
        .optional()
        .describe('Specific repositories. Requires owner parameter.'),
      user: z.string().optional().describe('Personal GitHub account'),
      org: z.string().optional().describe('GitHub organization'),

      extension: z.string().optional().describe('File extension filter'),
      filename: z.string().optional().describe('Exact filename'),
      language: z.string().optional().describe('Programming language'),
      path: z.string().optional().describe('Directory path'),
      size: z.string().optional().describe('File size filter in KB'),

      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(30)
        .describe('Maximum results (default: 30)'),
      match: z
        .enum(['file', 'path'])
        .optional()
        .describe(
          'Search scope: "file" for content only, "path" for paths only'
        ),
      enableQueryOptimization: z
        .boolean()
        .optional()
        .default(true)
        .describe('Auto-enhance simple queries with AND operators'),
    },
    {
      title: 'GitHub Code Search with Advanced Boolean Logic',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (
      args: GitHubCodeSearchParams & { enableQueryOptimization?: boolean }
    ) => {
      try {
        if (args.repo && !args.owner) {
          return createResult('Repository name requires owner parameter', true);
        }

        const finalQuery =
          args.enableQueryOptimization !== false
            ? optimizeSimpleQuery(args.query)
            : args.query;

        const result = await searchGitHubCode({ ...args, query: finalQuery });

        if (result.isError) {
          return createResult(result.content[0].text, true);
        }

        const { data, parsed } = parseJsonResponse(
          result.content[0].text as string
        );

        if (parsed) {
          // Handle different possible response formats
          if (data.results && Array.isArray(data.results)) {
            return createResult({
              q: args.query,
              results: data.results,
            });
          }

          // Handle case where no results found but valid response
          if (Array.isArray(data.results) && data.results.length === 0) {
            return createResult({
              q: args.query,
              results: [],
            });
          }
        }

        // Fallback for unparsed data
        return createResult({
          q: args.query,
          results: data || [],
        });
      } catch (error) {
        return createResult(
          `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          true
        );
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
