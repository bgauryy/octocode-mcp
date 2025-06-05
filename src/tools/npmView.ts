import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from './contstants';
import { npmView } from '../impl';
import { NPM_VIEW_DESCRIPTION } from '../prompts/npmView';

export function registerNpmViewTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_VIEW,
    NPM_VIEW_DESCRIPTION,
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze (e.g., 'react', '@types/node', 'lodash')"
        ),
    },
    async (args: { packageName: string }) => {
      try {
        return await npmView(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm package info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
