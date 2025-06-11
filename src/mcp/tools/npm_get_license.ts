import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { npmGetLicense } from '../../impl/npm/npmGetLicense';

export function registerNpmGetLicenseTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_GET_LICENSE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_LICENSE],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to get license information for (e.g., 'react', 'express', 'lodash'). Returns minimal license data: package name and license - optimized for token efficiency."
        ),
    },
    {
      title: 'NPM License Compliance - Extract Package License',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmGetLicense(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm license info: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
