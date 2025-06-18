import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GithubFetchRequestParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { createErrorResult, createSuccessResult } from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, filePath } = params;

    // Define branch fallback order - deduplicate to avoid duplicate API calls
    const branchFallbacks = [
      ...new Set([branch, 'main', 'master', 'develop', 'trunk']),
    ];
    let validBranch: string | null = null;
    let lastError: Error | null = null;

    try {
      // First, verify repository exists and find a valid branch
      for (const tryBranch of branchFallbacks) {
        try {
          const rootApiPath = `repos/${owner}/${repo}/contents?ref=${tryBranch}`;
          const rootResult = await executeGitHubCommand('api', [rootApiPath], {
            cache: false,
          });

          if (!rootResult.isError) {
            validBranch = tryBranch;
            break;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
      }

      if (!validBranch) {
        return createErrorResult(
          `Repository ${owner}/${repo} not found or no accessible branches`,
          new Error(
            `Tried branches: ${branchFallbacks.join(', ')}. ${
              lastError ? `Last error: ${lastError.message}` : ''
            }`
          )
        );
      }

      // Now fetch file metadata first to check size and type
      let apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;
      apiPath += `?ref=${validBranch}`;

      const metadataResult = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (metadataResult.isError) {
        const errorMsg = metadataResult.content[0].text as string;

        // Enhanced error handling with organization-aware suggestions
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          return createErrorResult(
            `File not found: ${filePath}`,
            new Error(
              `File does not exist in ${owner}/${repo} on branch ${validBranch}. ` +
                `Next steps:\n• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore repository structure\n• Use ${TOOL_NAMES.GITHUB_SEARCH_CODE} to search for the file`
            )
          );
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createErrorResult(
            `Access denied: ${filePath}`,
            new Error(
              `Permission denied for ${owner}/${repo}. This may be a private repository.\n` +
                `• Use ${TOOL_NAMES.API_STATUS_CHECK} to check available organizations\n` +
                `• Ensure you have access to the ${owner} organization\n` +
                `• Verify GitHub CLI authentication with 'gh auth status'`
            )
          );
        } else if (
          errorMsg.includes('rate limit') ||
          errorMsg.includes('429')
        ) {
          return createErrorResult(
            `Rate limit exceeded`,
            new Error(
              `GitHub API rate limit exceeded. Please wait before retrying.\n` +
                `• Consider using other tools as alternatives\n` +
                `• Rate limits reset hourly for authenticated users`
            )
          );
        } else if (errorMsg.includes('maxBuffer length exceeded')) {
          return createErrorResult(
            `File too large for metadata fetch: ${filePath}`,
            new Error(
              `File is too large - even metadata cannot be fetched due to CLI buffer limits.\n` +
                `• This typically happens with very large files (>2MB)\n` +
                `• Use ${TOOL_NAMES.GITHUB_SEARCH_CODE} to search for specific patterns\n` +
                `• Try downloading directly via raw GitHub URL\n` +
                `• Repository: https://github.com/${owner}/${repo}/blob/${validBranch}/${filePath}`
            )
          );
        } else {
          return createErrorResult(
            `Failed to fetch file: ${filePath}`,
            new Error(`API Error: ${errorMsg}`)
          );
        }
      }

      // Parse metadata to check file properties
      const metadataExecResult = JSON.parse(
        metadataResult.content[0].text as string
      );
      const fileMetadata = metadataExecResult.result;

      // Check if it's a directory (array indicates directory)
      if (Array.isArray(fileMetadata)) {
        return createErrorResult(
          `Path is a directory: ${filePath}`,
          new Error(
            `"${filePath}" is a directory, not a file.\n` +
              `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore directory contents\n` +
              `• Found ${fileMetadata.length} items in this directory`
          )
        );
      }

      // Additional check for directory type
      if (fileMetadata.type === 'dir') {
        return createErrorResult(
          `Path is a directory: ${filePath}`,
          new Error(
            `"${filePath}" is a directory, not a file.\n` +
              `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore directory contents`
          )
        );
      }

      // Check file size limits with multiple thresholds
      const fileSize = fileMetadata.size || 0;
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB - GitHub API hard limit
      const BUFFER_SAFE_SIZE = 256 * 1024; // 256KB - Safe for CLI buffer
      const WARN_FILE_SIZE = 100 * 1024; // 100KB - Performance warning

      // Hard limit: GitHub API won't serve files > 1MB
      if (fileSize > MAX_FILE_SIZE) {
        return createErrorResult(
          `File too large: ${filePath}`,
          new Error(
            `File size (${Math.round(fileSize / 1024)}KB) exceeds GitHub API limit (1MB).\n` +
              `• GitHub API does not serve file content for files > 1MB\n` +
              `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to get file metadata\n` +
              `• Download directly: ${fileMetadata.download_url}\n` +
              `• Consider using ${TOOL_NAMES.GITHUB_SEARCH_CODE} for specific code patterns`
          )
        );
      }

      // Buffer protection: Prevent CLI buffer overflow
      if (fileSize > BUFFER_SAFE_SIZE) {
        return createErrorResult(
          `File too large for buffer: ${filePath}`,
          new Error(
            `File size (${Math.round(fileSize / 1024)}KB) exceeds safe buffer limit (256KB).\n` +
              `• This prevents "maxBuffer length exceeded" errors\n` +
              `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to get file metadata\n` +
              `• Download directly: ${fileMetadata.download_url}\n` +
              `• For code analysis, use ${TOOL_NAMES.GITHUB_SEARCH_CODE} to find specific patterns`
          )
        );
      }

      // Get file content with size check
      const contentArgs = [apiPath, '--jq', '.content'];
      const contentResult = await executeGitHubCommand('api', contentArgs, {
        cache: false,
      });

      if (contentResult.isError) {
        const contentErrorMsg = contentResult.content[0].text as string;

        // Check if error is due to trying to get content from directory
        if (contentErrorMsg.includes('expected an object but got: array')) {
          return createErrorResult(
            `Path is a directory: ${filePath}`,
            new Error(
              `"${filePath}" is a directory, not a file.\n` +
                `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to explore directory contents\n` +
                `• Cannot fetch content from directories`
            )
          );
        }

        // Enhanced error handling for common CLI issues
        if (contentErrorMsg.includes('maxBuffer length exceeded')) {
          const sizeInKB = fileSize ? Math.round(fileSize / 1024) : 'unknown';
          return createErrorResult(
            `File too large for CLI buffer: ${filePath}`,
            new Error(
              `GitHub CLI buffer overflow - file is too large to fetch.\n` +
                `• File size: ${sizeInKB}KB\n` +
                `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to get file metadata\n` +
                `• Download directly: ${fileMetadata.download_url}\n` +
                `• Try ${TOOL_NAMES.GITHUB_SEARCH_CODE} for specific code patterns within the file`
            )
          );
        }

        return createErrorResult(
          `Failed to fetch file content: ${filePath}`,
          new Error(contentErrorMsg)
        );
      }

      // Extract and validate base64 content
      const contentExecResult = JSON.parse(
        contentResult.content[0].text as string
      );
      const base64Content = contentExecResult.result?.trim().replace(/\n/g, '');

      if (!base64Content || base64Content === 'null') {
        return createErrorResult(
          `Empty or invalid file content: ${filePath}`,
          new Error(
            `File "${filePath}" appears to be empty or binary.\n` +
              `• For binary files, use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to get metadata\n` +
              `• File may be empty or use non-UTF-8 encoding`
          )
        );
      }

      // Advanced binary file detection
      let decodedContent: string;
      let isBinaryFile = false;

      try {
        const buffer = Buffer.from(base64Content, 'base64');

        // Check for binary content by looking for null bytes and high percentage of non-printable chars
        const nullByteIndex = buffer.indexOf(0);
        const nonPrintableCount = buffer.filter(
          byte => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13
        ).length;
        const nonPrintablePercentage =
          (nonPrintableCount / buffer.length) * 100;

        isBinaryFile = nullByteIndex !== -1 || nonPrintablePercentage > 30;

        if (isBinaryFile) {
          return createErrorResult(
            `Binary file detected: ${filePath}`,
            new Error(
              `File "${filePath}" appears to be binary (${Math.round(nonPrintablePercentage)}% non-printable chars).\n` +
                `• Binary files cannot be displayed as text\n` +
                `• Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} to get file metadata\n` +
                `• File size: ${Math.round(fileSize / 1024)}KB\n` +
                `• Download URL: ${fileMetadata.download_url}`
            )
          );
        }

        decodedContent = buffer.toString('utf-8');
      } catch (decodeError) {
        return createErrorResult(
          `Failed to decode file content: ${filePath}`,
          new Error(
            `Unable to decode "${filePath}" as UTF-8.\n` +
              `• File may use different encoding or be binary\n` +
              `• File size: ${Math.round(fileSize / 1024)}KB\n` +
              `• Error: ${(decodeError as Error).message}`
          )
        );
      }

      // Calculate enhanced metadata
      const lines = decodedContent.split('\n');
      const lineCount = lines.length;
      const hasLongLines = lines.some(line => line.length > 500);
      const isEmpty = decodedContent.trim().length === 0;

      // Create comprehensive response with enhanced metadata
      const response = {
        filePath: filePath,
        owner: owner,
        repo: repo,
        branch: validBranch,
        content: decodedContent,
        metadata: {
          size: fileSize,
          lines: lineCount,
          encoding: 'utf-8',
          sha: fileMetadata.sha,
          downloadUrl: fileMetadata.download_url,
          htmlUrl: fileMetadata.html_url,
          isEmpty: isEmpty,
          hasLongLines: hasLongLines,
          ...(fileSize > WARN_FILE_SIZE && {
            sizeWarning: `Large file (${Math.round(fileSize / 1024)}KB) - consider using download URL for better performance`,
          }),
        },
        ...(validBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: validBranch,
            message: `Used '${validBranch}' instead of '${branch}'`,
          },
        }),
      };

      return createSuccessResult(response);
    } catch (error) {
      return createErrorResult(
        `Unexpected error fetching file: ${filePath}`,
        error as Error
      );
    }
  });
}
