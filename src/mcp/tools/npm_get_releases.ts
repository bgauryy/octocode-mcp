import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { createStandardResponse } from '../../impl/util';
import { npmGetReleases } from '../../impl/npm/npmGetReleases';

export function registerNpmGetReleasesTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_RELEASES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_RELEASES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get official release information for (e.g., 'axios', 'lodash', 'chalk'). Returns only semantic versions (major.minor.patch) with release dates, excluding pre-release versions like alpha, beta, rc. Provides last 10 official releases for maintenance pattern analysis."
        ),
    },
    {
      title: 'NPM Official Releases - Extract Production-Ready Release Data',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        const result = await npmGetReleases(args.packageName);

        if (result.content && result.content[0] && !result.isError) {
          const data = JSON.parse(result.content[0].text as string);
          return createStandardResponse({
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
              text: `Failed to get npm release info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
