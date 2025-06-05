import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubRepositoryStructureParams } from '../types';
import { TOOL_NAMES } from './contstants';
import { viewRepositoryStructure } from '../impl';
import { VIEW_REPOSITORY_STRUCTURE_DESCRIPTION } from '../prompts/viewRepositoryStructure';

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE,
    VIEW_REPOSITORY_STRUCTURE_DESCRIPTION,
    {
      owner: z
        .string()
        .describe(
          `Filter by repository owner/organization (e.g., 'wix-private') get from ${TOOL_NAMES.GET_USER_ORGANIZATIONS} tool`
        ),
      repo: z.string().describe('The name of the GitHub repository'),
      branch: z
        .string()
        .describe(
          `🔴 MANDATORY: Specify the branch to explore (e.g., 'main', 'master', 'develop'). Must be obtained from ${TOOL_NAMES.VIEW_REPOSITORY} first. Never explore without explicit branch specification.`
        ),
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          'The path within the repository to view the structure from. Defaults to the root of the repository. Allows for iterative exploration of the repository structure.'
        ),
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
