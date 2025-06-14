import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { npmGetVersions } from '../../impl/npm/npmGetVersions';

export function registerNpmGetVersionsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_VERSIONS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_VERSIONS],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get version information for (e.g., 'react', 'express', 'lodash'). Returns only official semantic versions (major.minor.patch format), excluding pre-release versions like alpha, beta, rc - optimized for production planning."
        ),
    },
    {
      title: 'NPM Version Tracking - Extract Package Versions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetVersions(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm versions: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
