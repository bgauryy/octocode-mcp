import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubViewRepoStructureQuery,
} from '../../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from '../toolMetadata.js';
import { GitHubViewRepoStructureBulkQuerySchema } from './scheme.js';
import { invokeCallbackSafely } from '../utils.js';
import { exploreMultipleRepositoryStructures } from './execution.js';

export function registerViewGitHubRepoStructureTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE],
      inputSchema:
        GitHubViewRepoStructureBulkQuerySchema as unknown as AnySchema,
      annotations: {
        title: 'GitHub Repository Structure Explorer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      async (
        args: {
          queries: GitHubViewRepoStructureQuery[];
        },
        authInfo,
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        await invokeCallbackSafely(
          callback,
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
          queries
        );

        return exploreMultipleRepositoryStructures({
          queries,
          authInfo,
          sessionId,
        });
      }
    )
  );
}
