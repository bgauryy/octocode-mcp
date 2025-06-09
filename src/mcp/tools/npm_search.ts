import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { npmSearch } from '../../impl/npm/npmSearch';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_SEARCH_PACKAGES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_SEARCH_PACKAGES],
    {
      query: z
        .string()
        .describe(
          "The search term(s) to find packages on NPM. Multiple terms can be space-separated (e.g., 'react query client'). Supports regex if term starts with /."
        ),
      searchlimit: z
        .number()
        .optional()
        .default(50)
        .describe(
          'Maximum number of search results to return. Defaults to 50.'
        ),
      json: z
        .boolean()
        .optional()
        .default(true)
        .describe('Output search results in JSON format. Defaults to true.'),
    },
    {
      title: 'Search NPM Packages',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { query: string; searchlimit?: number; json?: boolean }) => {
      try {
        return await npmSearch(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search npm packages: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
