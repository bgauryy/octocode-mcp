import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { GET_USER_ORGANIZATIONS_DESCRIPTION } from './descriptions/get_user_organizations';
import { getUserOrganizations } from '../../impl/github';

export function registerGetUserOrganizationsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GET_USER_ORGANIZATIONS,
    GET_USER_ORGANIZATIONS_DESCRIPTION,
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum number of organizations to list (default: 50)'),
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
