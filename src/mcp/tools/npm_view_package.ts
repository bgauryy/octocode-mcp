import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { npmViewPackage } from '../../impl/npm/npmViewPackage';
import { createResult } from '../../impl/util';

type NpmViewPackageParams = {
  packageName: string;
};

export function registerNpmViewPackageTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_VIEW_PACKAGE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_VIEW_PACKAGE],
    {
      packageName: z
        .string()
        .min(1, 'Package name is required')
        .describe(
          'The name of the npm package to get comprehensive metadata for including dependencies, versions, and repository information.'
        ),
    },
    {
      title: 'Get NPM Package Metadata',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_VIEW_PACKAGE],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: NpmViewPackageParams) => {
      try {
        if (!args.packageName || args.packageName.trim() === '') {
          return createResult('Package name is required', true);
        }

        // Basic package name validation
        if (!/^[a-z0-9@._/-]+$/.test(args.packageName)) {
          return createResult('Invalid package name format', true);
        }

        const result = await npmViewPackage(args.packageName);
        return result;
      } catch (error) {
        return createResult(
          `Failed to get package metadata: ${(error as Error).message}`,
          true
        );
      }
    }
  );
}
