import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetId } from '../../impl/npm/npmGetId';

export function registerNpmGetIdTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_ID,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_ID],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get ID information for (e.g., 'react', 'express', 'lodash'). Returns precise version identifier for dependency management, lockfiles, and reproducible builds - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Package Identification - Extract Name@Version ID',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetId(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm ID info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
