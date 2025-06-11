import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetBugs } from '../../impl/npm/npmGetBugs';

export function registerNpmGetBugsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_BUGS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_BUGS],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get bug tracking information for (e.g., 'react', 'express', 'lodash'). Returns minimal bug data: package name and bugs URL - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Bug Tracking - Extract Issue Tracker URL',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetBugs(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm bugs info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
