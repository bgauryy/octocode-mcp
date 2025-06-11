import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetDependencies } from '../../impl/npm/npmGetDependencies';

export function registerNpmGetDependenciesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_DEPENDENCIES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_DEPENDENCIES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze dependencies for (e.g., 'react', 'express', 'lodash'). Returns focused dependency data: dependencies, devDependencies, and resolutions - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Dependency Analysis - Extract Package Dependencies',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetDependencies(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm dependencies: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
