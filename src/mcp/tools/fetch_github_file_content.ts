import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GithubFetchRequestParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { fetchGitHubFileContent } from '../../impl/github/fetchGitHubFileContent';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_FILE_CONTENT,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
    {
      owner: z
        .string()
        .min(1)
        .describe(
          `Filter by repository owner/organization (e.g., 'example-org') get from ${TOOL_NAMES.GITHUB_GET_USER_ORGS} tool`
        ),
      repo: z.string().min(1).describe('The name of the GitHub repository'),
      branch: z
        .string()
        .min(1)
        .describe(
          'The default branch of the repository. Branch name MUST be obtained from repository metadata or structure tools.'
        ),
      filePath: z
        .string()
        .min(1)
        .describe('The path to the file within the repository'),
    },
    {
      title: 'Fetch GitHub File Content',
      description:
        'Extract complete file content from repositories with automatic branch recovery and comprehensive error handling. Essential for code analysis and implementation discovery.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GithubFetchRequestParams) => {
      try {
        // Enhanced input validation
        if (!args.owner?.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Repository owner required',
              },
            ],
            isError: true,
          };
        }

        if (!args.repo?.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Repository name required',
              },
            ],
            isError: true,
          };
        }

        if (!args.branch?.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Branch name required. Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to discover branches`,
              },
            ],
            isError: true,
          };
        }

        if (!args.filePath?.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: File path required',
              },
            ],
            isError: true,
          };
        }

        const result = await fetchGitHubFileContent(args);

        // Enhance successful response with minimal metadata
        if (result.content?.[0] && !result.isError) {
          const content = result.content[0].text as string;
          const lines = content.split('\n').length;
          const size = content.length;

          return {
            content: [
              {
                type: 'text',
                text: `File: ${args.filePath} (${lines} lines, ${size} bytes)\n\`\`\`\n${content}\n\`\`\``,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        let suggestions = '';

        if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          suggestions = `Solutions: Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore structure, ${TOOL_NAMES.GITHUB_SEARCH_CODE} to find files`;
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          suggestions = `Solutions: Repository may be private, use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          suggestions = `Solutions: Wait before retry, use ${TOOL_NAMES.GITHUB_SEARCH_CODE} instead`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch ${args.filePath}: ${errorMessage}${suggestions ? `. ${suggestions}` : ''}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
