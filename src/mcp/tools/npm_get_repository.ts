import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetRepository } from '../../impl/npm/npmGetRepository';
import { generateSmartRecovery } from '../../utils/smartRecovery';

export function registerNpmGetRepositoryTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_REPOSITORY,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_REPOSITORY],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get repository information for (e.g., 'react', 'express', 'lodash'). Returns minimal repository data: package name, description, repository URL, and homepage - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM Repository Discovery - Extract GitHub Repository URL',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetRepository(args.packageName);
      } catch (error) {
        const errorMessage = (error as Error).message;

        // Enhanced error handling for package not found
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found')
        ) {
          return generateSmartRecovery({
            tool: 'NPM Get Repository',
            packageName: args.packageName,
            context: args,
            error: error as Error,
          });
        }

        // Generic enhanced error handling
        return generateSmartRecovery({
          tool: 'NPM Get Repository',
          packageName: args.packageName,
          context: args,
          error: error as Error,
        });
      }
    }
  );
}
