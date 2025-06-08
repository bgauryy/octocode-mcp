import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github';

// Enhanced schema with security validation and smart defaults
const searchGitHubCodeSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(200, 'Query too long - use more specific terms (max 200 chars)')
    .refine(val => !/<[^>]*>/.test(val), 'Security: HTML tags not allowed')
    .refine(
      val => !/javascript:|data:|vbscript:/i.test(val),
      'Security: Script protocols not allowed'
    )
    .refine(
      val => !/\([^)]*\b(OR|AND|NOT)\b[^)]*\)/i.test(val),
      'GitHub API Error: Parenthetical boolean expressions like "(term1 OR term2)" are not supported. Use "term1 OR term2" instead.'
    )
    .describe(
      "The search query to find relevant code. You should reuse the user's exact query/most recent message with their wording unless there is a clear reason not to."
    ),
  owner: z
    .string()
    .min(1, 'Owner cannot be empty if provided')
    .max(39, 'GitHub usernames/orgs are max 39 characters')
    .regex(
      /^[a-zA-Z0-9\-._]+$/,
      'Owner must contain only valid GitHub username characters'
    )
    .describe(
      "Filter by repository owner/organization (e.g., 'example-org') get from get_user_organizations tool"
    ),
  repo: z
    .string()
    .min(1, 'Repository name cannot be empty if provided')
    .max(100, 'Repository names are typically under 100 characters')
    .regex(
      /^[a-zA-Z0-9\-._]+$/,
      'Repository name must contain only valid characters'
    )
    .optional()
    .describe('The name of the GitHub repository'),
  extension: z
    .string()
    .min(1, 'Extension cannot be empty if provided')
    .max(10, 'File extensions are typically short')
    .regex(
      /^[a-zA-Z0-9]+$/,
      'Extension should contain only alphanumeric characters'
    )
    .optional()
    .describe('Filter by file extension (e.g., "js", "ts", "py")'),
  filename: z
    .string()
    .min(1, 'Filename cannot be empty if provided')
    .max(255, 'Filenames are typically under 255 characters')
    .optional()
    .describe('Filter by filename (e.g., "package.json", "README.md")'),
  language: z
    .string()
    .min(1, 'Language cannot be empty if provided')
    .max(50, 'Language names are typically short')
    .optional()
    .describe(
      'Filter by programming language (e.g., "javascript", "typescript", "python")'
    ),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100 for performance')
    .optional()
    .default(30)
    .describe('Maximum number of results to return (default: 30)'),
});

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    searchGitHubCodeSchema.shape,
    {
      title: 'Search GitHub Code',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        // Validate owner/repo combination
        if (args.repo && !args.owner) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid owner/repo combination: owner required when repo specified',
              },
            ],
            isError: true,
          };
        }

        // Validate and handle parenthetical boolean expressions
        const hasParentheses = /[()]/.test(args.query);
        if (hasParentheses) {
          const hasBooleanInParens = /\([^)]*\b(OR|AND|NOT)\b[^)]*\)/i.test(
            args.query
          );
          if (hasBooleanInParens) {
            // Provide immediate helpful error with alternative
            const simplified = args.query
              .replace(/[()]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Complex boolean expressions with parentheses are not supported by GitHub API.

🔍 Your query: "${args.query}"
✅ Try instead: "${simplified}"

💡 GitHub Code Search API limitations:
- ❌ (useState OR useEffect) AND hooks
- ✅ useState OR useEffect hooks
- ❌ (term1 AND term2) OR term3  
- ✅ term1 AND term2 OR term3

Alternative search strategies:
1. Use multiple simple searches: "useState OR useEffect" then "hooks"
2. Use file extension filters: extension=ts, extension=js
3. Use path filters with qualifiers: path:src, path:components`,
                },
              ],
              isError: true,
            };
          }
        }

        return await searchGitHubCode(args);
      } catch (error) {
        // Enhanced error handling with context
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Provide helpful suggestions based on error type
        let suggestion = '';
        if (errorMessage.includes('rate limit')) {
          suggestion =
            ' Suggestion: Try using npm_search first to minimize GitHub API calls.';
        } else if (errorMessage.includes('authentication')) {
          suggestion =
            ' Suggestion: Check github-auth-status resource and re-authenticate if needed.';
        } else if (errorMessage.includes('not found')) {
          suggestion =
            ' Suggestion: Verify repository/owner names and try broader search terms.';
        } else if (
          errorMessage.includes('unable to parse query') ||
          errorMessage.includes('ERROR_TYPE_QUERY_PARSING_FATAL')
        ) {
          suggestion =
            ' Suggestion: Simplify boolean expressions. Use "term1 OR term2" instead of "(term1 OR term2) AND term3".';
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub code: ${errorMessage}${suggestion}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
