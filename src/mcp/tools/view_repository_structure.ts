import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubRepositoryStructureParams } from '../../types';
import { TOOL_NAMES } from '../contstants';
import { VIEW_REPOSITORY_STRUCTURE_DESCRIPTION } from './descriptions/view_repository_structure';
import { viewRepositoryStructure } from '../../impl/github';

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE,
    VIEW_REPOSITORY_STRUCTURE_DESCRIPTION,
    {
      owner: z
        .string()
        .describe(
          `Specify the repository owner/organization. This can be obtained using the appropriate tool for fetching user organizations.`
        ),
      repo: z.string().describe('The name of the GitHub repository'),
      branch: z
        .string()
        .describe(
          `MANDATORY: Specify the branch to explore (e.g., 'main', 'master', 'develop'). Must be obtained from ${TOOL_NAMES.VIEW_REPOSITORY} first. Never explore without explicit branch specification.`
        ),
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          'The path within the repository to view the structure from. Defaults to the root of the repository. Allows for iterative exploration of the repository structure.'
        ),
    },
    {
      title: 'View Repository Structure',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubRepositoryStructureParams) => {
      try {
        return await viewRepositoryStructure(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to view repository structure: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
