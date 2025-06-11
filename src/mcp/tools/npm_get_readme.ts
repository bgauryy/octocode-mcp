import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetReadme } from '../../impl/npm/npmGetReadme';

export function registerNpmGetReadmeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_README,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_README],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get README information for (e.g., 'react', 'express', 'lodash'). Returns minimal README data: package name and readme filename - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Documentation Access - Extract README Filename',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetReadme(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm readme info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
