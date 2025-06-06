import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from './contstants';
import { npmSearch } from '../impl';
import { NPM_SEARCH_DESCRIPTION } from '../prompts/npmSearch';

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_SEARCH,
    NPM_SEARCH_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search term(s) to find packages on NPM. Multiple terms can be space-separated (e.g., 'react query client'). Supports regex if term starts with /."
        ),
      json: z
        .boolean()
        .optional()
        .default(true)
        .describe('Output search results in JSON format. Defaults to true.'),
      searchlimit: z
        .number()
        .optional()
        .default(50)
        .describe(
          'Maximum number of search results to return. Defaults to 50.'
        ),
    },
    async (args: { query: string; json?: boolean; searchlimit?: number }) => {
      try {
        return await npmSearch(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search NPM: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
