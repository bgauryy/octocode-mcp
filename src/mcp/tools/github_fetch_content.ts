import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { fetchGitHubFileContent } from '../../impl/github/fetchGitHubFileContent';
import { createResult, parseJsonResponse } from '../../impl/util';

type GitHubFileContentParams = {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
};

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_FILE_CONTENT,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
    {
      owner: z.string().min(1).describe(`Repository owner/organization`),
      repo: z.string().min(1).describe('The name of the GitHub repository'),
      branch: z
        .string()
        .min(1)
        .describe(
          "Branch name (e.g., 'master', 'main'). Must be obtained from repository metadata."
        ),
      filePath: z
        .string()
        .min(1)
        .describe(
          'Path to the file within repository. Use github_get_contents to discover file paths first.'
        ),
    },
    {
      title: 'Extract Complete File Content from Repositories',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubFileContentParams) => {
      try {
        const result = await fetchGitHubFileContent(args);

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed) {
            return createResult({
              file: `${args.owner}/${args.repo}/${args.filePath}`,
              content: data.content || data,
              metadata: {
                branch: args.branch,
                size: data.size,
                encoding: data.encoding,
              },
            });
          } else {
            // Return raw file content
            return createResult({
              file: `${args.owner}/${args.repo}/${args.filePath}`,
              content: data,
              metadata: {
                branch: args.branch,
              },
            });
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        let suggestions: string[] = [];
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          suggestions = ['github_get_contents', 'github_search_code'];
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          suggestions = ['github_get_user_organizations'];
        } else if (errorMessage.includes('branch')) {
          suggestions = ['github_get_contents to verify branch'];
        }

        return createResult(
          `Failed to fetch file content: ${errorMessage}. Context: ${args.owner}/${args.repo}/${args.filePath} on ${args.branch}`,
          true,
          suggestions
        );
      }
    }
  );
}
