import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetDependencies } from '../../impl/npm/npmGetDependencies';
import { generateSmartRecovery } from '../../utils/smartRecovery';

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
        return generateSmartRecovery({
          tool: 'NPM Get Dependencies',
          packageName: args.packageName,
          context: args,
          error: error as Error,
        });
      }
    }
  );
}
