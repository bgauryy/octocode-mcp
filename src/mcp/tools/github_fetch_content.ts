import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
  getErrorSuggestions,
  createErrorResult,
  createSuccessResult,
} from '../../utils/responses';
import { GithubFetchRequestParams, GitHubFileContentParams } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_FILE_CONTENT,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_FILE_CONTENT],
    {
      owner: z
        .string()
        .min(1)
        .describe(
          `Repository owner/organization (e.g., 'microsoft', 'facebook')`
        ),
      repo: z
        .string()
        .min(1)
        .describe(`Repository name (e.g., 'vscode', 'react'). Case-sensitive.`),
      branch: z
        .string()
        .min(1)
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
      title: 'Read File Content from GitHub Repositories',
      description:
        `Fetches complete file content from GitHub repositories. ` +
        `Handles text files up to 500KB, detects binary files, supports branch fallback.`,
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
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        let suggestions: string[] = [];
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          suggestions = [
            TOOL_NAMES.GITHUB_GET_CONTENTS,
            TOOL_NAMES.GITHUB_SEARCH_CODE,
          ];
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          suggestions = [TOOL_NAMES.API_STATUS_CHECK];
        } else if (errorMessage.includes('branch')) {
          suggestions = [TOOL_NAMES.GITHUB_GET_CONTENTS];
        } else {
          suggestions = getErrorSuggestions(TOOL_NAMES.GITHUB_GET_FILE_CONTENT);
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
            `File not found: ${filePath}`,
            new Error(
              `File does not exist in ${owner}/${repo} on branch ${branch}`
            )
          );
        } else if (errorMsg.includes('403')) {
          return createErrorResult(
            `Access denied: ${filePath}`,
            new Error(`Permission denied for ${owner}/${repo}`)
          );
        } else {
          return createErrorResult(
            `Failed to fetch file: ${filePath}`,
            new Error(errorMsg)
          );
        }
      }

      return await processFileContent(result, owner, repo, branch, filePath);
    } catch (error) {
      return createErrorResult(
        `Unexpected error fetching file: ${filePath}`,
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
      `Path is a directory: ${filePath}`,
      new Error(`"${filePath}" is a directory, not a file`)
    );
  }

  const fileSize = fileData.size || 0;
  const MAX_FILE_SIZE = 500 * 1024; // 500KB limit for simplicity

  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return createErrorResult(
      `File too large: ${filePath}`,
      new Error(
        `File size (${Math.round(fileSize / 1024)}KB) exceeds limit (500KB)`
      )
    );
  }

  // Get and decode content
  const base64Content = fileData.content?.replace(/\s/g, ''); // Remove all whitespace

  if (!base64Content) {
    return createErrorResult(
      `Empty file: ${filePath}`,
      new Error(`File appears to be empty`)
    );
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    // Simple binary check - look for null bytes
    if (buffer.indexOf(0) !== -1) {
      return createErrorResult(
        `Binary file detected: ${filePath}`,
        new Error(`Binary files cannot be displayed as text`)
      );
    }

    decodedContent = buffer.toString('utf-8');
  } catch (decodeError) {
    return createErrorResult(
      `Failed to decode file: ${filePath}`,
      new Error(`Unable to decode file as UTF-8`)
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
