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
        'Explore repository directory structure with automatic branch recovery and comprehensive navigation guidance. Essential for understanding project organization and discovering code architecture.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubRepositoryStructureParams) => {
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
                text: 'Error: Branch name is required and cannot be empty. Use repository metadata tools to discover available branches first.',
              },
            ],
            isError: true,
          };
        }

        // Sanitize path - remove leading/trailing slashes and normalize
        const sanitizedPath = (args.path || '').replace(/^\/+|\/+$/g, '');

        const result = await viewRepositoryStructure({
          ...args,
          path: sanitizedPath,
        });

        // Enhance successful response with navigation guidance
        if (result.content && result.content[0] && !result.isError) {
          const responseText = result.content[0].text as string;

          // Parse structure data to provide insights
          let itemCount = 0;
          let directories = 0;
          let files = 0;
          const interestingPaths: string[] = [];

          try {
            const parsed = JSON.parse(responseText);
            if (parsed.rawOutput) {
              const rawData = JSON.parse(parsed.rawOutput);
              if (Array.isArray(rawData)) {
                itemCount = rawData.length;
                rawData.forEach((item: any) => {
                  if (item.type === 'dir') {
                    directories++;
                    // Identify interesting directories
                    const dirName = item.name?.toLowerCase() || '';
                    if (
                      [
                        'src',
                        'lib',
                        'components',
                        'utils',
                        'api',
                        'services',
                        'docs',
                        'examples',
                        'tests',
                      ].includes(dirName)
                    ) {
                      interestingPaths.push(
                        `${sanitizedPath ? sanitizedPath + '/' : ''}${item.name}`
                      );
                    }
                  } else if (item.type === 'file') {
                    files++;
                    // Identify important files
                    const fileName = item.name?.toLowerCase() || '';
                    if (
                      [
                        'readme.md',
                        'package.json',
                        'index.js',
                        'index.ts',
                        'main.py',
                        'requirements.txt',
                        'dockerfile',
                      ].includes(fileName)
                    ) {
                      interestingPaths.push(
                        `${sanitizedPath ? sanitizedPath + '/' : ''}${item.name}`
                      );
                    }
                  }
                });
              }
            }
          } catch {
            // If parsing fails, estimate from text
            const lines = responseText.split('\n').filter(line => line.trim());
            itemCount = Math.max(0, lines.length - 3);
          }

          // Provide structured summary for better usability
          const summary = {
            repository: `${args.owner}/${args.repo}`,
            branch: args.branch,
            currentPath: sanitizedPath || '/',
            totalItems: itemCount,
            directories: directories,
            files: files,
            timestamp: new Date().toISOString(),
            ...(interestingPaths.length > 0 && {
              suggestedExploration: interestingPaths,
            }),
          };

          let enhancedResponse = `# Repository Structure: ${args.owner}/${args.repo}\n\n## Summary\n${JSON.stringify(summary, null, 2)}\n\n## Directory Contents\n${responseText}`;

          // Add exploration guidance
          if (itemCount > 0) {
            enhancedResponse += `\n\n## Navigation Insights\n• Current location: ${sanitizedPath || 'root directory'}\n• Found ${directories} directories and ${files} files`;

            if (interestingPaths.length > 0) {
              enhancedResponse += `\n• Important paths discovered: ${interestingPaths.length} items\n• Suggested next exploration targets:\n${interestingPaths.map(path => `  - ${path}`).join('\n')}`;
            }

            // Path-specific suggestions
            if (!sanitizedPath) {
              enhancedResponse += `\n\n## Root Directory Analysis\n• Starting from repository root - good overview\n• Look for main entry points: src/, lib/, index files\n• Check documentation: README.md, docs/\n• Explore configuration: package.json, requirements.txt`;
            } else {
              enhancedResponse += `\n\n## Current Path Analysis\n• Exploring: ${sanitizedPath}\n• Use empty path to return to root\n• Navigate deeper by specifying subdirectory paths`;
            }
          } else {
            enhancedResponse += `\n\n## Empty Directory\n• No contents found at: ${sanitizedPath || 'root'}\n• Try different branch or path\n• Verify repository structure and permissions`;
          }

          // Add architectural insights based on common patterns
          enhancedResponse += `\n\n## Architecture Discovery Guide\n• **src/**: Source code and main implementation\n• **lib/**: Library code and shared utilities\n• **components/**: UI components (React, Vue, etc.)\n• **api/**: API routes and endpoints\n• **utils/**: Utility functions and helpers\n• **docs/**: Documentation and guides\n• **tests/**: Test files and specifications\n• **examples/**: Usage examples and demos`;

          // Add next steps guidance
          enhancedResponse += `\n\n## Exploration Strategy\n• Use github_get_file_content for specific files\n• Navigate deeper into interesting directories\n• Look for entry points (index files, main modules)\n• Check configuration files for project setup\n• Explore tests/ for usage examples`;

          return {
            content: [
              {
                type: 'text',
                text: enhancedResponse,
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
NOT FOUND SOLUTIONS:
• Verify repository exists: ${args.owner}/${args.repo}
• Check branch name: ${args.branch} (try 'main', 'master', 'develop')
• Verify path exists: ${args.path || 'root'}
• Use github_search_repos to find correct repository`;
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          errorType = 'permission';
          specificSuggestions = `
🔒 PERMISSION SOLUTIONS:
• Repository may be private - check authentication
• Use github_get_user_organizations for organization access
• Verify repository visibility and access rights`;
        } else if (
          errorMessage.includes('401') ||
          errorMessage.includes('authentication')
        ) {
          errorType = 'authentication';
          specificSuggestions = `
🔐 AUTHENTICATION SOLUTIONS:
• Check GitHub CLI authentication: gh auth status
• Login if needed: gh auth login
• Verify API permissions for repository access`;
        } else if (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          errorType = 'rate-limit';
          specificSuggestions = `
RATE LIMIT SOLUTIONS:
• Wait before retry (GitHub API limits)
• Use authentication to increase limits
• Reduce exploration frequency`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Failed to view repository structure: ${errorMessage}\n\nERROR TYPE: ${errorType.toUpperCase()}\n\nCONTEXT:\n• Repository: ${args.owner}/${args.repo}\n• Branch: ${args.branch}\n• Path: ${args.path || 'root'}${specificSuggestions}\n\nGENERAL TROUBLESHOOTING:\n• Verify repository exists and is accessible\n• Check branch name spelling (common: main, master, develop)\n• Start with root path (empty) before exploring subdirectories\n• Use github_search_repos to find and verify repositories\n• Ensure proper authentication for private repositories`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
