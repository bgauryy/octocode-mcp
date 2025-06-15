import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { createStandardResponse } from '../../impl/util';
import { npmGetDependencies } from '../../impl/npm/npmGetDependencies';

export function registerNpmGetDependenciesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_DEPENDENCIES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_DEPENDENCIES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze dependencies for (e.g., 'axios', 'lodash', 'chalk'). Returns focused dependency data: dependencies, devDependencies, and resolutions - optimized for token efficiency."
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
        const result = await npmGetDependencies(args.packageName);

        if (result.content && result.content[0] && !result.isError) {
          const data = JSON.parse(result.content[0].text as string);
          return createStandardResponse({
            searchType: SEARCH_TYPES.NPM_DEPENDENCIES,
            query: args.packageName,
            data: data,
          });
        }

        return result;
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
