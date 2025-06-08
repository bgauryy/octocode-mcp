import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { fetchGitHubFileContent } from '../../impl/github';
import { GithubFetchRequestParams } from '../../types';
import { FETCH_GITHUB_FILE_CONTENT_DESCRIPTION } from '../systemPrompts/tools';

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
          `The default branch of the repository. branch name MUST be obtained from ${TOOL_NAMES.VIEW_REPOSITORY} tool`
        ),
      filePath: z
        .string()
        .describe('The path to the file within the repository'),
    },
    {
      title: 'Fetch GitHub File Content',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
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
