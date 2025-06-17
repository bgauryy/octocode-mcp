import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GithubFetchRequestParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { fetchGitHubFileContent } from '../../impl/github/fetchGitHubFileContent';
import { createStandardResponse } from '../../impl/util';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_FILE_CONTENT,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
    {
      owner: z
        .string()
        .min(1)
        .describe(
          `Repository owner/organization. Get  owner from ${TOOL_NAMES.GITHUB_GET_USER_ORGS} tool for private repos`
        ),
      repo: z.string().min(1).describe('The name of the GitHub repository'),
      branch: z
        .string()
        .min(1)
        .describe(
          'Branch name (e.g., "master", "main"). MUST be obtained from repository metadata or ${TOOL_NAMES.GITHUB_GET_CONTENTS} tool. Auto-fallback to common branches if specified branch not found.'
        ),
      filePath: z
        .string()
        .min(1)
        .describe(
          'The path to the file within the repository (case-sensitive). Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to discover file paths first.'
        ),
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
                text: `Error: Repository owner required. Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} to discover available organizations.`,
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
                text: `Error: Repository name required. Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} to find repositories.`,
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
                text: `Error: Branch name required. Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to discover available branches.`,
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
                text: `Error: File path required. Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore repository structure first.`,
              },
            ],
            isError: true,
          };
        }

        // Call the enhanced implementation
        const result = await fetchGitHubFileContent(args);

        // If successful, format as standard response
        if (result.content?.[0] && !result.isError) {
          const content = result.content[0].text as string;

          try {
            const data = JSON.parse(content);
            return createStandardResponse({
              searchType: SEARCH_TYPES.FILE_CONTENT,
              query: args.filePath,
              data: data,
            });
          } catch (parseError) {
            // If not JSON, treat as plain text content
            return createStandardResponse({
              searchType: SEARCH_TYPES.FILE_CONTENT,
              query: args.filePath,
              data: {
                error: 'Failed to parse response',
                raw: content,
              },
            });
          }
        }

        // Return the error result from the implementation (it already has good error messages)
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        return {
          content: [
            {
              type: 'text',
              text: `Unexpected error: ${errorMessage}. Try using ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore repository structure first.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
