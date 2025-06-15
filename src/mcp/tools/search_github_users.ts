import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubUsersSearchParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { searchGitHubUsers } from '../../impl/github/searchGitHubUsers';

export function registerSearchGitHubUsersTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_USERS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_USERS],
    {
      query: z
        .string()
        .min(1, 'Search query is required and cannot be empty')
        .describe(
          "The search query to find users/organizations (e.g., 'react developer', 'python', 'machine learning')"
        ),
      owner: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org'). OPTIONAL: Leave empty for global searches across all of GitHub."
        ),
      type: z
        .enum(['user', 'org'])
        .optional()
        .describe(
          'Filter by account type (user for individuals, org for organizations)'
        ),
      location: z
        .string()
        .optional()
        .describe(
          "Filter by location (e.g., 'San Francisco', 'London', 'Remote')"
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Filter by primary programming language (e.g., 'javascript', 'python', 'java')"
        ),
      repos: z
        .string()
        .optional()
        .describe(
          "Filter by repository count (e.g., '>10', '>50' for active contributors)"
        ),
      followers: z
        .string()
        .optional()
        .describe(
          "Filter by follower count (e.g., '>100', '>1000' for influential users)"
        ),
      created: z
        .string()
        .optional()
        .describe(
          "Filter based on account creation date (e.g., '>2020-01-01', '<2023-12-31')"
        ),
      sort: z
        .enum(['followers', 'repositories', 'joined'])
        .optional()
        .describe('Sort users by specified criteria (default: best-match)'),
      order: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Order of results returned (default: desc)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Maximum number of users to return (default: 50, max: 100)'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe('The page number of the results to fetch (default: 1)'),
    },
    {
      title: 'Search GitHub Users',
      description:
        'Find developers, experts, and community leaders across GitHub. Essential for discovering contributors, finding expertise, and building professional networks within specific technology ecosystems.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubUsersSearchParams) => {
      try {
        // Enhanced input validation
        if (!args.query || args.query.trim().length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        if (args.query.length > 256) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Search query is too long. Please limit to 256 characters or less.',
              },
            ],
            isError: true,
          };
        }

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

        if (args.page && args.page < 1) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Page number must be 1 or greater',
              },
            ],
            isError: true,
          };
        }

        // Validate numeric filters
        const numericFilters = [
          { field: 'repos', value: args.repos },
          { field: 'followers', value: args.followers },
        ];

        for (const { field, value } of numericFilters) {
          if (value && !/^[><]=?\d+$/.test(value)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${field} filter must be in format ">10", ">=50", "<1000", etc.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Validate date format
        if (args.created && !/^[><]=?\d{4}-\d{2}-\d{2}$/.test(args.created)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: created date must be in format ">2020-01-01", "<2023-12-31", etc.',
              },
            ],
            isError: true,
          };
        }

        const result = await searchGitHubUsers(args);

        // Check for empty results and enhance with smart suggestions
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
            const lines = responseText.split('\n').filter(line => line.trim());
            resultCount = Math.max(0, lines.length - 5);
          }

          // Provide structured summary for better usability
          const summary = {
            query: args.query,
            accountType: args.type || 'all types',
            location: args.location || 'global',
            language: args.language || 'all languages',
            totalResults: resultCount,
            page: args.page || 1,
            sort: args.sort || 'best-match',
            timestamp: new Date().toISOString(),
            ...(resultCount === 0 && {
              suggestions: [
                'Try broader search terms (e.g., "developer", "engineer")',
                'Remove location/language filters for global search',
                'Use different account types (user vs org)',
                'Try technology keywords ("react", "python", "javascript")',
                'Search for specific skills or job titles',
              ],
            }),
          };

          let enhancedResponse = `# GitHub Users Search Results\n\n## Summary\n${JSON.stringify(summary, null, 2)}\n\n## Search Results\n${responseText}`;

          // Add context-specific guidance
          if (resultCount > 0) {
            enhancedResponse += `\n\n## Discovery Insights\n• Found ${resultCount} users/organizations matching your criteria`;

            if (args.type === 'user') {
              enhancedResponse += `\n• INDIVIDUAL DEVELOPERS: Good for finding personal expertise and contributions`;
            } else if (args.type === 'org') {
              enhancedResponse += `\n• ORGANIZATIONS: Companies and groups - good for discovering teams and projects`;
            } else {
              enhancedResponse += `\n• MIXED RESULTS: Both individuals and organizations`;
            }

            if (args.language) {
              enhancedResponse += `\n• LANGUAGE FOCUS: ${args.language} developers - specialized expertise`;
            }

            if (args.location) {
              enhancedResponse += `\n• LOCATION FILTER: ${args.location} - regional talent pool`;
            }

            if (args.followers) {
              enhancedResponse += `\n• INFLUENCE FILTER: ${args.followers} followers - community leaders and influencers`;
            }

            if (args.repos) {
              enhancedResponse += `\n• ACTIVITY FILTER: ${args.repos} repositories - active contributors`;
            }
          } else {
            enhancedResponse += `\n\n## Search Optimization Tips\n• START BROAD: Try technology names ("react", "python", "javascript")\n• REMOVE FILTERS: Search globally first, then add location/language filters\n• TRY ROLES: Search for "developer", "engineer", "maintainer", "contributor"\n• COMMUNITY SEARCH: Look for "open source", "contributor", "maintainer"\n• SKILL SEARCH: Use specific technologies, frameworks, or tools`;
          }

          // Add user-specific guidance
          enhancedResponse += `\n\n## User Discovery Guide\n• **High Followers**: Community leaders and influencers (>1000 followers)\n• **Active Contributors**: Prolific developers (>50 repositories)\n• **Organizations**: Companies, teams, and communities\n• **Location-based**: Regional talent and communities\n• **Language-specific**: Technology experts and specialists\n• **Recent Joiners**: New talent and fresh perspectives`;

          // Add networking and collaboration tips
          enhancedResponse += `\n\n## Collaboration Opportunities\n• Follow interesting users for updates and insights\n• Check user repositories for collaboration opportunities\n• Review organization profiles for potential employment\n• Explore user contributions to popular projects\n• Connect with users in your technology stack or location`;

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
          specificSuggestions = `\n\n🔒 AUTHENTICATION SOLUTIONS:\n• Check GitHub CLI authentication: gh auth status\n• Login if needed: gh auth login\n• Verify API permissions for user search`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          specificSuggestions = `\n\n⏱️ RATE LIMIT SOLUTIONS:\n• Wait before retry (GitHub API limits)\n• Use authentication to increase limits\n• Reduce search frequency and scope`;
        } else if (
          errorMessage.includes('validation') ||
          errorMessage.includes('invalid')
        ) {
          specificSuggestions = `\n\n🔧 VALIDATION SOLUTIONS:\n• Check filter formats (e.g., followers:">100", repos:">10")\n• Verify date formats (e.g., created:">2020-01-01")\n• Simplify search query and remove special characters`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub users: ${errorMessage}${specificSuggestions}\n\n🔧 GENERAL TROUBLESHOOTING:\n• Use simpler search terms (technology names work well)\n• Remove restrictive filters for broader results\n• Try different account types (user vs organization)\n• Search for common roles: "developer", "engineer", "maintainer"\n• Use location or language filters to narrow results effectively`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
