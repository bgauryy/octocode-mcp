import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { GithubFetchRequestParams, GitHubFileContentParams } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME } from './github_view_repo_structure';

export const GITHUB_GET_FILE_CONTENT_TOOL_NAME = 'githubGetFileContent';

const DESCRIPTION = `Fetch file content from GitHub repositories. Use ${GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME} first to explore repository structure and find exact file paths. Supports automatic branch fallback (main/master) and handles files up to 300KB. Parameters: owner (required - GitHub username/org), repo (required - repository name), branch (required), filePath (required).`;

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.registerTool(
    GITHUB_GET_FILE_CONTENT_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        owner: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
          .describe(
            `Repository owner/org name (e.g., 'microsoft', 'google', NOT 'microsoft/vscode')`
          ),
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/)
          .describe(
            `Repository name only (e.g., 'vscode', 'react', NOT 'microsoft/vscode')`
          ),
        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/)
          .describe(`Branch name. Falls back to main/master if not found`),
        filePath: z
          .string()
          .min(1)
          .describe(
            `Exact file path from repo root (e.g., src/index.js, README.md)`
          ),
      },
      annotations: {
        title: 'GitHub File Content - Direct Access',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubFileContentParams): Promise<CallToolResult> => {
      try {
        const result = await fetchGitHubFileContent(args);
        return result;
      } catch (error) {
        return createResult({
          error:
            'Failed to fetch file. Verify path with github_get_contents first',
        });
      }
    }
  );
}

async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, filePath } = params;

    try {
      // Try to fetch file content directly
      const apiPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Try fallback branches if original branch fails
        if (
          errorMsg.includes('404') &&
          branch !== 'main' &&
          branch !== 'master'
        ) {
          const fallbackBranches = ['main', 'master'];

          for (const fallbackBranch of fallbackBranches) {
            const fallbackPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${fallbackBranch}`;
            const fallbackResult = await executeGitHubCommand(
              'api',
              [fallbackPath],
              {
                cache: false,
              }
            );

            if (!fallbackResult.isError) {
              return await processFileContent(
                fallbackResult,
                owner,
                repo,
                fallbackBranch,
                filePath
              );
            }
          }
        }

        // Handle common errors
        if (errorMsg.includes('404')) {
          return createResult({
            error:
              'File not found. Use github_view_repo_structure to explore repository structure',
          });
        } else if (errorMsg.includes('403')) {
          return createResult({
            error:
              'Access denied. Repository may be private - use apiStatusCheck to verify',
          });
        } else if (
          errorMsg.includes('maxBuffer') ||
          errorMsg.includes('stdout maxBuffer length exceeded')
        ) {
          return createResult({
            error:
              'File too large (>300KB). Use githubSearchCode to search for patterns within the file',
          });
        } else {
          return createResult({
            error: 'Failed to fetch file. Verify repository name and file path',
          });
        }
      }

      return await processFileContent(result, owner, repo, branch, filePath);
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle maxBuffer errors that escape the main try-catch
      if (
        errorMessage.includes('maxBuffer') ||
        errorMessage.includes('stdout maxBuffer length exceeded')
      ) {
        return createResult({
          error:
            'File too large (>300KB). Use github_search_code to search for patterns within the file',
        });
      }

      return createResult({
        error: 'Unexpected error. Check network connection and try again',
      });
    }
  });
}

async function processFileContent(
  result: CallToolResult,
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<CallToolResult> {
  // Extract the actual content from the exec result
  const execResult = JSON.parse(result.content[0].text as string);
  const fileData = execResult.result;
  // Check if it's a directory
  if (Array.isArray(fileData)) {
    return createResult({
      error:
        'Path is a directory. Use github_view_repo_structure to list directory contents',
    });
  }

  const fileSize = typeof fileData.size === 'number' ? fileData.size : 0;
  const MAX_FILE_SIZE = 300 * 1024; // 300KB limit for better performance and reliability

  // Check file size with helpful message
  if (fileSize > MAX_FILE_SIZE) {
    const fileSizeKB = Math.round(fileSize / 1024);
    const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

    return createResult({
      error: `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file`,
    });
  }

  // Get and decode content with validation
  if (!fileData.content) {
    return createResult({
      error: 'File is empty - no content to display',
    });
  }

  const base64Content = fileData.content.replace(/\s/g, ''); // Remove all whitespace

  if (!base64Content) {
    return createResult({
      error: 'File is empty - no content to display',
    });
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    // Simple binary check - look for null bytes
    if (buffer.indexOf(0) !== -1) {
      return createResult({
        error:
          'Binary file detected. Cannot display as text - download directly from GitHub',
      });
    }

    decodedContent = buffer.toString('utf-8');
  } catch (decodeError) {
    return createResult({
      error:
        'Failed to decode file. Encoding may not be supported (expected UTF-8)',
    });
  }

  return createResult({
    data: {
      filePath,
      owner,
      repo,
      branch,
      content: decodedContent,
    },
  });
}
