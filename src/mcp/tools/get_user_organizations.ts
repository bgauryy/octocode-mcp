import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { getUserOrganizations } from '../../impl/github/getUserOrganizations';

export function registerGetUserOrganizationsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_USER_ORGS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_USER_ORGS],
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of organizations to list (default: 50)'),
    },
    {
      title: 'Get User Organizations',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { limit?: number }) => {
      try {
        return await getUserOrganizations(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get user organizations: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
