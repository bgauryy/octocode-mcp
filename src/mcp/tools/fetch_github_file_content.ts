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
        if (!args.owner || args.owner.trim() === '') {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Repository owner is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        if (!args.repo || args.repo.trim() === '') {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Repository name is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        if (!args.branch || args.branch.trim() === '') {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Branch name is required and cannot be empty. Use repository structure tools to discover branches first.',
              },
            ],
            isError: true,
          };
        }

        if (!args.filePath || args.filePath.trim() === '') {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: File path is required and cannot be empty',
              },
            ],
            isError: true,
          };
        }

        const result = await fetchGitHubFileContent(args);

        // Enhance successful response with metadata
        if (result.content && result.content[0] && !result.isError) {
          const content = result.content[0].text as string;
          const contentLength = content.length;
          const lineCount = content.split('\n').length;

          // Provide structured summary for better usability
          const summary = {
            repository: `${args.owner}/${args.repo}`,
            branch: args.branch,
            filePath: args.filePath,
            contentLength: contentLength,
            lineCount: lineCount,
            timestamp: new Date().toISOString(),
            fileType: args.filePath.split('.').pop() || 'unknown',
          };

          return {
            content: [
              {
                type: 'text',
                text: `# File Content: ${args.filePath}\n\n## Summary\n${JSON.stringify(summary, null, 2)}\n\n## Content\n\`\`\`\n${content}\n\`\`\``,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Enhanced error analysis
        let errorType = 'general';
        let specificSuggestions = '';

        if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          errorType = 'not-found';
          specificSuggestions = `
🔍 FILE NOT FOUND SOLUTIONS:
• Verify file path exists: ${args.filePath}
• Check repository structure with github_get_contents
• Confirm branch exists: ${args.branch}
• Use github_search_code to find similar files`;
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          errorType = 'permission';
          specificSuggestions = `
🔒 PERMISSION SOLUTIONS:
• Repository may be private - check authentication
• Use github_get_user_organizations for organization access
• Verify repository visibility settings`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          errorType = 'rate-limit';
          specificSuggestions = `
⏱️ RATE LIMIT SOLUTIONS:
• Wait before retry (GitHub API limits)
• Use authentication to increase limits: gh auth login
• Try searching for content instead of direct access`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch GitHub file content: ${errorMessage}\n\n🔧 ERROR TYPE: ${errorType.toUpperCase()}\n\n📋 CONTEXT:\n• Repository: ${args.owner}/${args.repo}\n• Branch: ${args.branch}\n• File: ${args.filePath}${specificSuggestions}\n\n💡 GENERAL TROUBLESHOOTING:\n• Use github_get_contents to explore repository structure\n• Verify repository exists and is accessible\n• Check branch name spelling and existence\n• Use github_search_code for pattern-based file discovery`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
