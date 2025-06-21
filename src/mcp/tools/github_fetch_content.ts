import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createResult,
  parseJsonResponse,
  createErrorResult,
  createSuccessResult,
} from '../../utils/responses';
import { GithubFetchRequestParams, GitHubFileContentParams } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_get_file_content';

const DESCRIPTION = `Read file content. This tool REQUIRES exact path verification from github_get_contents or package view exports. If fetching fails, re-check file existence with github_get_contents or branch name.`;

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      owner: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
        .describe(
          `Repository owner/organization (e.g., 'microsoft', 'facebook')`
        ),
      repo: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9._-]+$/)
        .describe(`Repository name (e.g., 'vscode', 'react'). Case-sensitive.`),
      branch: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[^\s]+$/)
        .describe(
          `Branch name (e.g., 'main', 'master'). Auto-fallback to common branches if not found.`
        ),
      filePath: z
        .string()
        .min(1)
        .describe(
          `File path from repository root (e.g., 'README.md', 'src/index.js'). Use github_get_contents to explore structure.`
        ),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubFileContentParams) => {
      try {
        const result = await fetchGitHubFileContent(args);

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse<{
            content?: string;
            size?: number;
            encoding?: string;
          }>(result.content[0].text as string);

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
        return createResult(
          'File fetch failed - verify file path exists or try github_get_contents first',
          true
        );
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
          return createErrorResult(
            'File not found - verify path with github_get_contents first',
            new Error(filePath)
          );
        } else if (errorMsg.includes('403')) {
          return createErrorResult(
            'Access denied - repository may be private or require authentication',
            new Error(`${owner}/${repo}`)
          );
        } else {
          return createErrorResult(
            'Fetch failed - check repository and file path',
            new Error(errorMsg)
          );
        }
      }

      return await processFileContent(result, owner, repo, branch, filePath);
    } catch (error) {
      return createErrorResult(
        'Unexpected error during file fetch - check connection and permissions',
        error as Error
      );
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
  const fileData = JSON.parse(execResult.result);
  // Check if it's a directory
  if (Array.isArray(fileData)) {
    return createErrorResult(
      'Path is directory - use github_get_contents to browse directory structure',
      new Error(filePath)
    );
  }

  const fileSize = fileData.size || 0;
  const MAX_FILE_SIZE = 500 * 1024; // 500KB limit for simplicity

  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return createErrorResult(
      'File too large - files over 500KB cannot be fetched',
      new Error(`${Math.round(fileSize / 1024)}KB > 500KB`)
    );
  }

  // Get and decode content
  const base64Content = fileData.content?.replace(/\s/g, ''); // Remove all whitespace

  if (!base64Content) {
    return createErrorResult(
      'Empty file - file has no content to display',
      new Error(filePath)
    );
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    // Simple binary check - look for null bytes
    if (buffer.indexOf(0) !== -1) {
      return createErrorResult(
        'Binary file detected - cannot display binary content as text',
        new Error(filePath)
      );
    }

    decodedContent = buffer.toString('utf-8');
  } catch (decodeError) {
    return createErrorResult(
      'Decode failed - file encoding not supported or corrupted',
      new Error(filePath)
    );
  }

  // Return simplified response
  const response = {
    filePath,
    owner,
    repo,
    branch,
    content: decodedContent,
    metadata: {
      size: fileSize,
      lines: decodedContent.split('\n').length,
      encoding: 'utf-8',
    },
  };

  return createSuccessResult(response);
}
