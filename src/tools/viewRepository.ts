import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubRepositoryViewParams } from '../types';
import { TOOL_NAMES } from './contstants';
import { viewGitHubRepositoryInfo } from '../impl';
import { VIEW_REPOSITORY_DESCRIPTION } from '../prompts/viewRepository';

export function registerViewRepositoryTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.VIEW_REPOSITORY,
    VIEW_REPOSITORY_DESCRIPTION,
    {
      owner: z
        .string()
        .describe(
          "Filter by repository owner/organization (e.g., 'wix-private')"
        ),
      repo: z
        .string()
        .describe(
          "The name of the GitHub repository to view (e.g. 'premium-ai-playground')"
        ),
    },
    async (args: GitHubRepositoryViewParams) => {
      try {
        return await viewGitHubRepositoryInfo(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to view repository: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
