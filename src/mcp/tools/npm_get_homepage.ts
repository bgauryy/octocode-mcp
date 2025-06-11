import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetHomepage } from '../../impl/npm/npmGetHomepage';

export function registerNpmGetHomepageTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_HOMEPAGE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_HOMEPAGE],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get homepage information for (e.g., 'react', 'express', 'lodash'). Returns direct access to official documentation, interactive examples, and comprehensive project resources - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Homepage Discovery - Extract Project Website URL',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetHomepage(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm homepage info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
