import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCommitsSearchParams } from '../../types';
import { searchGitHubCommits } from '../../impl/github/searchGitHubCommits';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';

export function registerSearchGitHubCommitsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_COMMITS],
    {
      query: z
        .string()
        .optional()
        .describe(
          "The search query to find commits - start with a keyword (e.g., 'bug', 'refactor', 'feature'). If omitted, will return the most recent commits (exploratory mode)."
        ),
      owner: z
        .string()
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org') obtained from the appropriate tool for fetching user organizations"
        ),
      repo: z
        .string()
        .optional()
        .describe("Filter by repository name (e.g., 'cli/cli')"),
      author: z.string().optional().describe('Filter by commit author'),
      committer: z.string().optional().describe('Filter by committer'),
      authorDate: z
        .string()
        .optional()
        .describe(
          "Filter based on authored date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      committerDate: z
        .string()
        .optional()
        .describe(
          "Filter based on committed date (e.g., '>2022-01-01', '<2023-12-31')"
        ),
      authorEmail: z.string().optional().describe('Filter on author email'),
      authorName: z.string().optional().describe('Filter on author name'),
      committerEmail: z
        .string()
        .optional()
        .describe('Filter on committer email'),
      committerName: z.string().optional().describe('Filter on committer name'),
      merge: z.boolean().optional().describe('Filter on merge commits'),
      hash: z.string().optional().describe('Filter by commit hash'),
      parent: z.string().optional().describe('Filter by parent hash'),
      tree: z.string().optional().describe('Filter by tree hash'),
      sort: z
        .enum(['author-date', 'committer-date', 'best-match'])
        .optional()
        .default('best-match')
        .describe('Sort commits by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of commits returned (default: desc for newest first)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe(
          'Maximum number of commits to return (default: 50, max: 100)'
        ),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe('Filter based on repository visibility'),
    },
    {
      title: 'Search GitHub Commits',
      description:
        'Search commit history for development tracking and code evolution with comprehensive filtering options. Essential for understanding project development patterns and finding specific changes.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCommitsSearchParams) => {
      try {
        // Enhanced input validation
        if (args.limit && (args.limit < 1 || args.limit > 100)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Limit must be between 1 and 100',
              },
            ],
            isError: true,
          };
        }

        // Validate date formats
        const dateFields = [
          { field: 'authorDate', value: args.authorDate },
          { field: 'committerDate', value: args.committerDate },
        ];

        for (const { field, value } of dateFields) {
          if (value && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(value)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${field} must be in format ">2022-01-01", "<2023-12-31", ">=2022-06-01", etc.`,
                },
              ],
              isError: true,
            };
          }
        }

        // If query is undefined or empty, treat as exploratory (recent commits)
        const searchArgs =
          !args.query || args.query.trim() === ''
            ? { ...args, query: undefined }
            : args;

        const result = await searchGitHubCommits(searchArgs);

        // Enhance response with metadata and guidance
        if (result.content && result.content[0]) {
          const responseText = result.content[0].text as string;
          let resultCount = 0;

          try {
            const parsed = JSON.parse(responseText);
            if (parsed.rawOutput) {
              const rawData = JSON.parse(parsed.rawOutput);
              resultCount = Array.isArray(rawData) ? rawData.length : 0;
            }
          } catch {
            // If parsing fails, estimate from text
            const lines = responseText.split('\n').filter(line => line.trim());
            resultCount = Math.max(0, lines.length - 5);
          }

          // Provide structured summary for better usability
          const summary = {
            searchMode: args.query ? 'keyword-search' : 'exploratory',
            query: args.query || 'recent commits',
            owner: args.owner || 'global search',
            repo: args.repo || 'all repositories',
            totalResults: resultCount,
            sort: args.sort || 'best-match',
            timestamp: new Date().toISOString(),
            ...(resultCount === 0 && {
              suggestions: [
                'Try broader search terms (e.g., "fix", "update", "add")',
                'Remove repository filters for global search',
                'Use different sort criteria (author-date, committer-date)',
                'Check for typos in repository/organization names',
              ],
            }),
          };

          let enhancedResponse = `# GitHub Commits Search Results\n\n## Summary\n${JSON.stringify(summary, null, 2)}\n\n## Search Results\n${responseText}`;

          // Add context-specific guidance
          if (resultCount > 0) {
            enhancedResponse += `\n\n## Usage Insights\n• Found ${resultCount} commits matching your criteria\n• Use commit hashes for detailed analysis\n• Consider date ranges for temporal analysis\n• Filter by author for contributor-specific changes`;

            if (args.query) {
              enhancedResponse += `\n• Keyword search: "${args.query}" - try related terms for broader discovery`;
            } else {
              enhancedResponse += `\n• Exploratory mode: showing recent commits - add query for specific searches`;
            }
          } else {
            enhancedResponse += `\n\n## Search Optimization Tips\n• START SIMPLE: Try basic keywords like "fix", "feature", "update"\n• REMOVE FILTERS: Search globally first, then add owner/repo filters\n• DATE RANGES: Use ">2023-01-01" format for recent commits\n• AUTHOR SEARCH: Filter by specific contributors for focused results`;
          }

          return {
            content: [
              {
                type: 'text',
                text: enhancedResponse,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Enhanced error analysis
        let specificSuggestions = '';
        if (
          errorMessage.includes('authentication') ||
          errorMessage.includes('401')
        ) {
          specificSuggestions = `\n\n🔒 AUTHENTICATION SOLUTIONS:\n• Check GitHub CLI authentication: gh auth status\n• Login if needed: gh auth login\n• Verify API permissions for commit search`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          specificSuggestions = `\n\n⏱️ RATE LIMIT SOLUTIONS:\n• Wait before retry (GitHub API limits)\n• Use authentication to increase limits\n• Reduce search scope with filters`;
        } else if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          specificSuggestions = `\n\n🔍 NOT FOUND SOLUTIONS:\n• Verify repository exists: ${args.owner}/${args.repo}\n• Check organization/user name spelling\n• Try global search without owner/repo filters`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub commits: ${errorMessage}${specificSuggestions}\n\n🔧 GENERAL TROUBLESHOOTING:\n• Use simpler search terms (single keywords work best)\n• Try exploratory mode (no query) for recent commits\n• Remove restrictive filters and search globally first\n• Verify repository access and visibility settings`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
