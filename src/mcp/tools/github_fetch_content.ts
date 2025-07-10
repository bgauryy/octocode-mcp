import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import {
  GithubFetchRequestParams,
  GitHubFileContentResponse,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { minifyContent } from '../../utils/minifier';

export const GITHUB_GET_FILE_CONTENT_TOOL_NAME = 'githubGetFileContent';

const DESCRIPTION = `Fetches the content of a file from a GitHub repository. Automatically falls back between main/master branches if not found.`;

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
            `Repository owner/organization name (e.g., 'facebook', 'microsoft'). Do NOT include repository name here.`
          ),
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/)
          .describe(
            `Repository name only (e.g., 'react', 'vscode'). Do NOT include owner/org prefix.`
          ),
        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/)
          .describe(
            `Branch name, tag name, OR commit SHA. Tool will automatically try 'main' and 'master' if specified branch is not found.`
          ),
        filePath: z
          .string()
          .min(1)
          .describe(
            `File path from repository root (e.g., 'src/index.js', 'README.md', 'docs/api.md'). Do NOT start with slash.`
          ),
        startLine: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(`Starting line number (1-based) for partial file access.`),
        endLine: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(`Ending line number (1-based) for partial file access.`),
        contextLines: z
          .number()
          .int()
          .min(0)
          .max(50)
          .optional()
          .default(5)
          .describe(`Context lines around target range. Default: 5.`),
        minified: z
          .boolean()
          .default(true)
          .describe(
            `Optimize content for token efficiency (enabled by default).`
          ),
      },
      annotations: {
        title: 'GitHub File Content - Partial Access (Default/Recommended)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
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

export async function fetchGitHubFileContent(
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

        // Silent fallback for main/master branches only
        if (
          errorMsg.includes('404') &&
          (branch === 'main' || branch === 'master')
        ) {
          const fallbackBranch = branch === 'main' ? 'master' : 'main';
          const fallbackPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${fallbackBranch}`;

          // Retry with fallback branch
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
              filePath,
              params.minified,
              params.startLine,
              params.endLine,
              params.contextLines
            );
          }
        }

        // Return original error if fallback didn't work or wasn't applicable
        return result;
      }

      return await processFileContent(
        result,
        owner,
        repo,
        branch,
        filePath,
        params.minified,
        params.startLine,
        params.endLine,
        params.contextLines
      );
    } catch (error) {
      return createResult({
        error: `Error fetching file content: ${error}`,
      });
    }
  });
}

async function processFileContent(
  result: CallToolResult,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  minified: boolean,
  startLine?: number,
  endLine?: number,
  contextLines: number = 5
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
      error: `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
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

  // Handle partial file access
  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;
  let hasLineAnnotations = false;

  // Always calculate total lines for metadata
  const lines = decodedContent.split('\n');
  const totalLines = lines.length;

  if (startLine !== undefined) {
    // Validate line numbers
    if (startLine < 1 || startLine > totalLines) {
      return createResult({
        error: `Invalid startLine ${startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
      });
    }

    // Calculate actual range with context
    const contextStart = Math.max(1, startLine - contextLines);
    const contextEnd = endLine
      ? Math.min(totalLines, endLine + contextLines)
      : Math.min(totalLines, startLine + contextLines);

    // Validate endLine if provided
    if (endLine !== undefined) {
      if (endLine < startLine) {
        return createResult({
          error: `Invalid range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
        });
      }
      if (endLine > totalLines) {
        return createResult({
          error: `Invalid endLine ${endLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
        });
      }
    }

    // Extract the specified range with context from ORIGINAL content
    const selectedLines = lines.slice(contextStart - 1, contextEnd);

    actualStartLine = contextStart;
    actualEndLine = contextEnd;
    isPartial = true;

    // Add line number annotations for partial content
    const annotatedLines = selectedLines.map((line, index) => {
      const lineNumber = contextStart + index;
      const isInTargetRange =
        lineNumber >= startLine &&
        (endLine === undefined || lineNumber <= endLine);
      const marker = isInTargetRange ? '→' : ' ';
      return `${marker}${lineNumber.toString().padStart(4)}: ${line}`;
    });

    finalContent = annotatedLines.join('\n');
    hasLineAnnotations = true;
  }

  // Apply minification to final content (both partial and full files)
  let minificationFailed = false;
  let minificationType = 'none';

  if (minified) {
    if (hasLineAnnotations) {
      // For partial content with line annotations, extract code content first
      const annotatedLines = finalContent.split('\n');
      const codeLines = annotatedLines.map(line => {
        // Remove line number annotations but preserve the original line content
        const match = line.match(/^[→ ]\s*\d+:\s*(.*)$/);
        return match ? match[1] : line;
      });

      const codeContent = codeLines.join('\n');
      const minifyResult = await minifyContent(codeContent, filePath);

      if (!minifyResult.failed) {
        // Apply minification first, then add simple line annotations
        // Since minified content may be much shorter, use a simplified annotation approach
        finalContent = `Lines ${actualStartLine}-${actualEndLine} (minified):\n${minifyResult.content}`;
        minificationType = minifyResult.type;
      } else {
        minificationFailed = true;
      }
    } else {
      // Full file minification
      const minifyResult = await minifyContent(finalContent, filePath);
      finalContent = minifyResult.content;
      minificationFailed = minifyResult.failed;
      minificationType = minifyResult.type;
    }
  }

  return createResult({
    data: {
      filePath,
      owner,
      repo,
      branch,
      content: finalContent,
      // Always return total lines for LLM context
      totalLines,
      // Original request parameters for LLM context
      requestedStartLine: startLine,
      requestedEndLine: endLine,
      requestedContextLines: contextLines,
      // Actual content boundaries (only for partial content)
      ...(isPartial && {
        startLine: actualStartLine,
        endLine: actualEndLine,
        isPartial,
      }),
      // Minification metadata
      ...(minified && {
        minified: !minificationFailed,
        minificationFailed: minificationFailed,
        minificationType: minificationType,
      }),
    } as GitHubFileContentResponse,
  });
}
