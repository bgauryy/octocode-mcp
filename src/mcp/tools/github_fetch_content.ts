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

const DESCRIPTION = `Fetches the content of a file from a GitHub repository.

**TOKEN OPTIMIZATION WORKFLOW**: From github search results -> extract lines -> Fetch targeted sections

**PARTIAL ACCESS** (startLine/endLine):
- Target search result lines exactly
- contextLines: Surrounding code (default: 5)
- Full file can also be fetched for full context, but it's not recommended in most cases.

**CAPABILITIES**:
- Smart minification for optimal tokens
- Indentation-aware processing for 15+ languages

Great for research and code discovery with token efficiency`;

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
            `Branch name (e.g., 'main', 'master'). Tool will automatically try 'main' and 'master' if specified branch is not found.`
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
          .describe(
            `**STRONGLY RECOMMENDED**: Starting line number (1-based) for partial file access. Extract from github_search_code results for targeted content. Use with endLine for specific sections. Saves 80-90% tokens and ensures line numbers match search results exactly.`
          ),
        endLine: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            `Ending line number (1-based) for partial file access. Use with startLine for specific sections. If omitted, gets from startLine to reasonable endpoint with context.`
          ),
        contextLines: z
          .number()
          .int()
          .min(0)
          .max(50)
          .optional()
          .default(5)
          .describe(
            `Context lines around target range. Default: 5. Increase for more surrounding code, decrease for minimal context. Only used with startLine/endLine.`
          ),
        minified: z
          .boolean()
          .default(true)
          .describe(
            `Smart content optimization for token efficiency (enabled by default). Partial content gets balanced compression, full files get maximum compression. Use false only when you need complete formatting, comments, and documentation.`
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

async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, filePath } = params;

    try {
      // Try to fetch file content directly
      const apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;

      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Check repository existence only after content fetch fails
        const repoCheckResult = await executeGitHubCommand(
          'api',
          [`/repos/${owner}/${repo}`],
          {
            cache: false,
          }
        );

        if (repoCheckResult.isError) {
          const repoErrorMsg = repoCheckResult.content[0].text as string;
          if (repoErrorMsg.includes('404')) {
            return createResult({
              error: `Repository "${owner}/${repo}" not found. This is often due to incorrect repository name. Steps to resolve:\n1. Use github_search_code with query="${filePath.split('/').pop()}" owner="${owner}" to find the correct repository\n2. Verify the exact repository name\n3. Check if the repository might have been renamed or moved`,
            });
          } else if (repoErrorMsg.includes('403')) {
            return createResult({
              error: `Repository "${owner}/${repo}" exists but access is denied. Repository might be private or archived. Use api_status_check to verify permissions.`,
            });
          }
        }

        // Try fallback branches if original branch fails
        if (
          errorMsg.includes('404') &&
          branch !== 'main' &&
          branch !== 'master'
        ) {
          const fallbackBranches = ['main', 'master'];
          const triedBranches = [branch];

          for (const fallbackBranch of fallbackBranches) {
            if (triedBranches.includes(fallbackBranch)) continue;
            triedBranches.push(fallbackBranch);

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
                filePath,
                params.minified,
                params.startLine,
                params.endLine,
                params.contextLines
              );
            }
          }

          return createResult({
            error: `File not found in any common branches (tried: ${triedBranches.join(', ')}). File might have been moved or deleted. Use github_search_code to find current location.`,
          });
        }

        // Handle common errors with more context
        if (errorMsg.includes('404')) {
          const searchSuggestion = await suggestCodeSearchFallback(
            owner,
            filePath
          );
          return createResult({
            error: `File "${filePath}" not found in branch "${branch}".

Quick fixes:
• Use github_view_repo_structure to verify path exists
• Check for typos in file path
• Try different branch (main/master/develop)${searchSuggestion}

Alternative strategies:
• Use github_search_code with query="filename:${filePath.split('/').pop()}" owner="${owner}"
• Use github_search_code with query="path:${filePath}" to find similar paths`,
          });
        } else if (errorMsg.includes('403')) {
          return createResult({
            error: `Access denied to "${filePath}" in "${owner}/${repo}".

Possible causes & solutions:
• Private repository: use api_status_check to verify permissions
• File in private directory: check repository access level
• Rate limiting: wait 5-10 minutes and retry
• Authentication: run gh auth login

Alternative approaches:
• Use github_search_code with query="path:${filePath}" owner="${owner}"
• Use github_view_repo_structure to explore accessible paths
• Check repository on GitHub.com for public access`,
          });
        } else if (
          errorMsg.includes('maxBuffer') ||
          errorMsg.includes('stdout maxBuffer length exceeded')
        ) {
          return createResult({
            error: `File "${filePath}" is too large (>300KB).

Alternative strategies:
• Use github_search_code to search within the file
• Download directly from: https://github.com/${owner}/${repo}/blob/${branch}/${filePath}
• Use github_view_repo_structure to find smaller related files
• Look for configuration or summary files instead`,
          });
        } else {
          const searchSuggestion = await suggestCodeSearchFallback(
            owner,
            filePath
          );
          return createResult({
            error: `Failed to fetch "${filePath}": ${errorMsg}

Troubleshooting steps:
1. Verify repository exists: github_view_repo_structure
2. Check network connection and GitHub status
3. Verify authentication: gh auth status
4. Try different branch names${searchSuggestion}

Recovery strategies:
• Use github_search_code for content discovery
• Try github_search_repos to find similar repositories
• Check file on GitHub.com: https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`,
          });
        }
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

// Helper function to suggest code search strategy
async function suggestCodeSearchFallback(
  owner: string,
  filePath: string
): Promise<string> {
  try {
    // Extract filename and try to find in same organization
    const fileName = filePath.split('/').pop() || filePath;
    const searchResult = await executeGitHubCommand(
      'api',
      [`/search/code?q=${encodeURIComponent(fileName)}+in:path+org:${owner}`],
      { cache: false }
    );

    if (!searchResult.isError) {
      const results = JSON.parse(searchResult.content[0].text as string);
      if (results.total_count > 0) {
        const firstMatch = results.items[0];
        return ` File might be in ${firstMatch.repository.full_name}. Try these searches:\n1. github_search_code with query="${fileName}" owner="${owner}"\n2. github_search_code with query="path:${filePath}" owner="${owner}"`;
      }
    }
  } catch {
    // Fallback to generic message if search fails
  }

  return ` Try these searches:\n1. github_search_code with query="${filePath.split('/').pop()}" owner="${owner}"\n2. github_search_code with query="path:${filePath}"`;
}
