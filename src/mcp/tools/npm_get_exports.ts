import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetExports } from '../../impl/npm/npmGetExports';

export function registerNpmGetExportsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_EXPORTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_EXPORTS],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get exports information for (e.g., 'react', 'express', 'lodash'). Returns import path intelligence: available modules, entry points, and tree-shakable exports for optimal code search - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Module Structure - Extract Package Export Mappings',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetExports(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm exports info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
