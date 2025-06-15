import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { getUserOrganizations } from '../../impl/github/getUserOrganizations';
import { createOptimizedError, createStandardResponse } from '../../impl/util';

export function registerGetUserOrganizationsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_USER_ORGS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_USER_ORGS],
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe(
          'Maximum number of organizations to list (default: 50, max: 100)'
        ),
    },
    {
      title: 'Get User Organizations',
      description:
        'Discover user organizations for enterprise/private repository access. Essential for accessing organizational repositories and understanding user affiliations.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { limit?: number }) => {
      try {
        // Input validation
        const limit = args.limit || 50;
        if (limit < 1 || limit > 100) {
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

        const result = await getUserOrganizations({ limit });

        // Handle the new clean format
        if (result.content && result.content[0]) {
          const responseText = result.content[0].text as string;

          try {
            const parsed = JSON.parse(responseText);

            // Return clean organizations array - just the organizations
            return createStandardResponse({
              searchType: SEARCH_TYPES.ORGANIZATIONS,
              query: undefined,
              data: parsed.organizations || [],
            });
          } catch {
            // Fallback for old format - parse text manually
            const lines = responseText.split('\n');
            const orgStart = lines.findIndex(line =>
              line.includes('Organizations for authenticated user:')
            );
            const importantStart = lines.findIndex(line =>
              line.includes('IMPORTANT:')
            );

            if (orgStart >= 0 && importantStart >= 0) {
              const orgLines = lines
                .slice(orgStart + 1, importantStart)
                .map(line => line.trim())
                .filter(
                  line => line.length > 0 && !line.includes('Organizations')
                );

              return createStandardResponse({
                searchType: SEARCH_TYPES.ORGANIZATIONS,
                query: undefined,
                data: orgLines,
              });
            }

            return createStandardResponse({
              searchType: SEARCH_TYPES.ORGANIZATIONS,
              query: undefined,
              data: [],
            });
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return createOptimizedError('Get user organizations', errorMessage, [
          'gh auth status',
          'gh auth login',
          'check org memberships',
        ]);
      }
    }
  );
}
