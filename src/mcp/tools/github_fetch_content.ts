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

const DESCRIPTION = `Read file content with exact path verification. Smart branch fallbacks and size limits. Use github_get_contents first to verify file existence.`;

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        owner: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
          .describe(`Repository owner/organization`),
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/)
          .describe(`Repository name. Case-sensitive.`),
        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/)
          .describe(
            `Branch name. Auto-fallback to common branches if not found.`
          ),
        filePath: z
          .string()
          .min(1)
          .describe(
            `File path from repository root. Use github_get_contents to explore structure.`
          ),
      },
      annotations: {
        title: 'GitHub File Content Reader',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubFileContentParams): Promise<CallToolResult> => {
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
          'File fetch failed - verify path or try github_get_contents first',
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
            'File not found - verify path with github_get_contents',
            new Error(filePath)
          );
        } else if (errorMsg.includes('403')) {
          return createErrorResult(
            'Access denied - repository may be private',
            new Error(`${owner}/${repo}`)
          );
        } else if (
          errorMsg.includes('maxBuffer') ||
          errorMsg.includes('stdout maxBuffer length exceeded')
        ) {
          return createErrorResult(
            'File too large (>300KB) - use github_search_code for patterns instead',
            new Error(`Buffer overflow: ${filePath}`)
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
      const errorMessage = (error as Error).message;

      // Handle maxBuffer errors that escape the main try-catch
      if (
        errorMessage.includes('maxBuffer') ||
        errorMessage.includes('stdout maxBuffer length exceeded')
      ) {
        return createErrorResult(
          'File too large (>300KB) - use github_search_code for patterns instead',
          error as Error
        );
      }

      return createErrorResult(
        'Unexpected error during file fetch - check connection',
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
      'Path is directory - use github_get_contents instead',
      new Error(filePath)
    );
  }

  const fileSize = fileData.size || 0;
  const MAX_FILE_SIZE = 300 * 1024; // 300KB limit for better performance and reliability

  // Check file size with helpful message
  if (fileSize > MAX_FILE_SIZE) {
    const fileSizeKB = Math.round(fileSize / 1024);
    const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

    return createErrorResult(
      `File too large (${fileSizeKB}KB > ${maxSizeKB}KB) - use github_search_code for patterns`,
      new Error(`File: ${filePath} (${fileSizeKB}KB)`)
    );
  }

  // Get and decode content
  const base64Content = fileData.content?.replace(/\s/g, ''); // Remove all whitespace

  if (!base64Content) {
    return createErrorResult(
      'Empty file - no content to display',
      new Error(filePath)
    );
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    // Simple binary check - look for null bytes
    if (buffer.indexOf(0) !== -1) {
      return createErrorResult(
        'Binary file detected - cannot display as text',
        new Error(filePath)
      );
    }

    decodedContent = buffer.toString('utf-8');
  } catch (decodeError) {
    return createErrorResult(
      'Decode failed - file encoding not supported',
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
