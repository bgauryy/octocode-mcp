import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubRepositoryStructureParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { viewRepositoryStructure } from '../../impl/github/viewRepositoryStructure';

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_CONTENTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_CONTENTS],
    {
      owner: z
        .string()
        .min(1)
        .describe(
          `Specify the repository owner/organization. This can be obtained using the appropriate tool for fetching user organizations.`
        ),
      repo: z.string().min(1).describe('The name of the GitHub repository'),
      branch: z
        .string()
        .min(1)
        .describe(
          "MANDATORY: Specify the branch to explore (e.g., 'main', 'master'). Branch name MUST be obtained from repository metadata or structure tools. Never explore without explicit branch specification."
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
      description:
        'View the directory structure and files in a GitHub repository path',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubRepositoryStructureParams) => {
      try {
        const result = await viewRepositoryStructure(args);

        // If successful, enhance the response with navigation hints
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          // Add helpful navigation suggestions based on what was found
          try {
            const content = JSON.parse(responseText);
            const hasFiles = content.files && content.files.length > 0;
            const hasDirs =
              content.directories && content.directories.length > 0;

            if (hasFiles || hasDirs) {
              let enhancedResponse = responseText;

              // Add exploration strategy based on common patterns
              const commonFiles =
                content.files?.filter((f: string) =>
                  [
                    'README.md',
                    'package.json',
                    'index.js',
                    'index.ts',
                    'main.py',
                    'setup.py',
                  ].includes(f)
                ) || [];

              const srcDirs =
                content.directories?.filter((d: string) =>
                  ['src', 'lib', 'packages', 'components', 'modules'].includes(
                    d
                  )
                ) || [];

              const docsDirs =
                content.directories?.filter((d: string) =>
                  ['docs', 'documentation', 'examples', 'demo'].includes(d)
                ) || [];

              if (
                commonFiles.length > 0 ||
                srcDirs.length > 0 ||
                docsDirs.length > 0
              ) {
                enhancedResponse += `\n\n## Exploration Strategy\n• Use ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} for specific files\n• Navigate deeper into interesting directories\n• Look for entry points (index files, main modules)\n• Check configuration files for project setup\n• Explore source code directories first`;

                if (commonFiles.length > 0) {
                  enhancedResponse += `\n\n## Key Files Found:\n${commonFiles.map((f: string) => `• ${f}`).join('\n')}`;
                }

                if (srcDirs.length > 0) {
                  enhancedResponse += `\n\n## Source Directories:\n${srcDirs.map((d: string) => `• ${d}/`).join('\n')}`;
                }

                if (docsDirs.length > 0) {
                  enhancedResponse += `\n\n## Documentation:\n${docsDirs.map((d: string) => `• ${d}/`).join('\n')}`;
                }
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: enhancedResponse,
                  },
                ],
              };
            }
          } catch (parseError) {
            // If we can't parse, just return the original result
          }
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
          suggestions = `• Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} to find correct repository`;
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          suggestions = `• Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for organization access
• Repository may be private - check authentication`;
        } else if (
          errorMessage.includes('invalid') ||
          errorMessage.includes('branch')
        ) {
          suggestions = `• Verify branch name exists
• Try common branches: main, master, develop
• Check repository default branch`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to explore repository structure: ${errorMessage}

Context:
• Repository: ${args.owner}/${args.repo}
• Branch: ${args.branch}
• Path: ${args.path || '/'}

${suggestions}

General troubleshooting:
• Verify repository exists and is accessible
• Check branch name spelling and existence
• Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} to find repositories before exploring subdirectories
• Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} to find and verify repositories
• Ensure proper authentication for private repositories`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
