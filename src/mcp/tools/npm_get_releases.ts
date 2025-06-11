import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetReleases } from '../../impl/npm/npmGetReleases';

export function registerNpmGetReleasesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_RELEASES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_RELEASES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get release information for (e.g., 'react', 'express', 'lodash'). Returns focused release data: last modified, created date, version count, and last 10 releases - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Package Releases - Extract Recent Release Data',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetReleases(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm release info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
