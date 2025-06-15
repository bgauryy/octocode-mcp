import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { createStandardResponse } from '../../impl/util';
import { npmGetExports } from '../../impl/npm/npmGetExports';

export function registerNpmGetExportsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_EXPORTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_EXPORTS],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze for comprehensive API intelligence (e.g., 'axios', 'lodash', 'chalk'). Returns complete public interface discovery including entry points, import paths, export mappings, search targets, and package analysis context. Essential for understanding package public API, generating accurate import statements, and enabling precise GitHub code searches."
        ),
    },
    {
      title: 'NPM API Intelligence - Comprehensive Public Interface Discovery',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        const result = await npmGetExports(args.packageName);

        if (result.content && result.content[0] && !result.isError) {
          const data = JSON.parse(result.content[0].text as string);
          return createStandardResponse({
            searchType: SEARCH_TYPES.NPM_EXPORTS,
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
              text: `Failed to get npm API intelligence: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
