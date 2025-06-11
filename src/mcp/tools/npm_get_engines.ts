import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetEngines } from '../../impl/npm/npmGetEngines';

export function registerNpmGetEnginesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_ENGINES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_ENGINES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get engines information for (e.g., 'react', 'express', 'lodash'). Returns environment compatibility requirements to prevent deployment failures and runtime conflicts - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Runtime Compatibility - Extract Engine Requirements',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetEngines(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm engines info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
