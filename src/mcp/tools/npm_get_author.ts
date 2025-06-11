import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetAuthor } from '../../impl/npm/npmGetAuthor';

export function registerNpmGetAuthorTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_AUTHOR,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_AUTHOR],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get author information for (e.g., 'react', 'express', 'lodash'). Returns focused author data: author and maintainers list - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Maintainer Information - Extract Author and Maintainers',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetAuthor(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm author info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
