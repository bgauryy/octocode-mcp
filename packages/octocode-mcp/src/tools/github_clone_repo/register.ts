/**
 * Register the githubCloneRepo tool with the MCP server.
 *
 * This tool enables AI agents to clone (or partially fetch) a GitHub
 * repository so that local filesystem tools and LSP semantic tools can
 * analyse the code offline. Clones are cached for 24 hours.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import {
  BulkCloneRepoSchema,
  GITHUB_CLONE_REPO_DESCRIPTION,
} from './scheme.js';
import { executeCloneRepo } from './execution.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import { GitHubCloneRepoOutputSchema } from '../../scheme/outputSchemas.js';

export function registerGitHubCloneRepoTool(server: McpServer) {
  return server.registerTool(
    STATIC_TOOL_NAMES.GITHUB_CLONE_REPO,
    {
      description: GITHUB_CLONE_REPO_DESCRIPTION,
      inputSchema: BulkCloneRepoSchema as unknown as AnySchema,
      outputSchema: GitHubCloneRepoOutputSchema as unknown as AnySchema,
      annotations: {
        title: 'Clone / Fetch GitHub Repository Locally',
        readOnlyHint: false, // writes cloned files to disk
        destructiveHint: false, // never deletes user data
        idempotentHint: true, // cached clones are reused
        openWorldHint: true, // accesses GitHub via git + API
      },
    },
    withSecurityValidation(
      STATIC_TOOL_NAMES.GITHUB_CLONE_REPO,
      async (args, authInfo, sessionId) => {
        const { queries } = args as { queries: unknown[] };
        return executeCloneRepo({
          queries: queries as Parameters<typeof executeCloneRepo>[0]['queries'],
          authInfo,
          sessionId,
        });
      }
    )
  );
}
