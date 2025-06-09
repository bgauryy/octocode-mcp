import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { GithubFetchRequestParams } from '../../types';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { fetchGitHubFileContent } from '../../impl/github/fetchGitHubFileContent';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_FILE_CONTENT,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
    {
      owner: z
        .string()
        .describe(
          `Filter by repository owner/organization (e.g., 'example-org') get from ${TOOL_NAMES.GITHUB_GET_USER_ORGS} tool`
        ),
      repo: z.string().describe('The name of the GitHub repository'),
      branch: z
        .string()
        .describe(
          `The default branch of the repository. branch name MUST be obtained from ${TOOL_NAMES.GITHUB_GET_REPOSITORY} tool`
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
