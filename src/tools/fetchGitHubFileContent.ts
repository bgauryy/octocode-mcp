import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GithubFetchRequestParams } from '../types';
import { TOOL_NAMES } from './contstants';
import { FETCH_GITHUB_FILE_CONTENT_DESCRIPTION } from '../prompts/fetchGitHubFileContent';
import { fetchGitHubFileContent } from '../impl/github';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
    FETCH_GITHUB_FILE_CONTENT_DESCRIPTION,
    {
      owner: z
        .string()
        .describe(
          `Filter by repository owner/organization (e.g., 'example-org') get from ${TOOL_NAMES.GET_USER_ORGANIZATIONS} tool`
        ),
      repo: z.string().describe('The name of the GitHub repository'),
      branch: z
        .string()
        .describe(
          `RECOMMENDED: The branch of the repository (e.g., "main", "master", "dev"). If branch doesn't exist, automatically tries common alternatives (main/master/develop/trunk) and finally default branch. Get from ${TOOL_NAMES.VIEW_REPOSITORY} for best results.`
        ),
      filePath: z
        .string()
        .describe('The path to the file within the repository'),
    },
    async (args: GithubFetchRequestParams) => {
      try {
        return await fetchGitHubFileContent(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch GitHub file content: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
