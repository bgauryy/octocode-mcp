import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { npmPackageStats } from '../../impl/npm';
import { NPM_PACKAGE_STATS_DESCRIPTION } from '../systemPrompts/tools';

export function registerNpmPackageStatsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_PACKAGE_STATS,
    NPM_PACKAGE_STATS_DESCRIPTION,
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze (e.g., 'react', '@types/node', 'lodash')"
        ),
    },
    {
      title: 'NPM Package Statistics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmPackageStats(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm package statistics: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
