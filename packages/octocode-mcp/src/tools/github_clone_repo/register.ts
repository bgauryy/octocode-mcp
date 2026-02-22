/**
 * Register the githubCloneRepo tool with the MCP server.
 *
 * This tool enables AI agents to clone (or partially fetch) a GitHub
 * repository so that local filesystem tools and LSP semantic tools can
 * analyse the code offline. Clones are cached for 24 hours.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import type { ToolInvocationCallback } from '../../types.js';
import {
  BulkCloneRepoSchema,
  GITHUB_CLONE_REPO_DESCRIPTION,
} from './scheme.js';
import { executeCloneRepo } from './execution.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import { GitHubCloneRepoOutputSchema } from '../../scheme/outputSchemas.js';
import { invokeCallbackSafely } from '../utils.js';

export function registerGitHubCloneRepoTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_CLONE_REPO,
    {
      description: GITHUB_CLONE_REPO_DESCRIPTION,
      inputSchema: BulkCloneRepoSchema as unknown as AnySchema,
      outputSchema: GitHubCloneRepoOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Clone / Fetch GitHub Repository Locally',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_CLONE_REPO,
      async (args, authInfo, sessionId) => {
        const { queries } = args as { queries: unknown[] };

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_CLONE_REPO,
          queries
        );

        return executeCloneRepo({
          queries: queries as Parameters<typeof executeCloneRepo>[0]['queries'],
          authInfo,
          sessionId,
        });
      }
    )
  );
}
