import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GithubFetchRequestParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { createErrorResult, createSuccessResult } from '../util';

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, filePath } = params;

    // Define branch fallback order
    const branchFallbacks = [branch, 'main', 'master', 'develop', 'trunk'];
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

      // Now try to fetch the specific file with the valid branch
      let apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;
      apiPath += `?ref=${validBranch}`;

      const args = [apiPath, '--jq', '.content'];
      const result = await executeGitHubCommand('api', args, { cache: false });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Enhanced error handling with specific suggestions
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          return createErrorResult(
            `File not found: ${filePath}`,
            new Error(
              `File "${filePath}" does not exist in ${owner}/${repo} on branch ${validBranch}. ` +
                `Suggestions: 1) Use github_get_contents to explore the repository structure first, ` +
                `2) Check if the file path is correct (case-sensitive), ` +
                `3) Verify the file exists in the expected directory`
            )
          );
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createErrorResult(
            `Access denied: ${filePath}`,
            new Error(
              `Permission denied for ${owner}/${repo}. ` +
                `The repository may be private or you may not have access. ` +
                `Use github_get_user_organizations to check available organizations.`
            )
          );
        } else if (
          errorMsg.includes('rate limit') ||
          errorMsg.includes('429')
        ) {
          return createErrorResult(
            `Rate limit exceeded`,
            new Error(
              `GitHub API rate limit exceeded. Wait before retrying or use github_search_code for alternative access.`
            )
          );
        } else {
          return createErrorResult(
            `Failed to fetch file: ${filePath}`,
            new Error(errorMsg)
          );
        }
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Validate base64 content
      if (!base64Content || base64Content === 'null') {
        return createErrorResult(
          `Empty or invalid file content: ${filePath}`,
          new Error(
            `File "${filePath}" appears to be empty or binary. ` +
              `For binary files, use github_get_contents to get file metadata instead.`
          )
        );
      }

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        return createErrorResult(
          `Failed to decode file content: ${filePath}`,
          new Error(
            `Unable to decode "${filePath}" as UTF-8. ` +
              `This file may be binary or use a different encoding.`
          )
        );
      }

      // Successful response with metadata
      return createSuccessResult({
        filePath: filePath,
        owner: owner,
        repo: repo,
        branch: validBranch,
        content: decodedContent,
        size: decodedContent.length,
        lines: decodedContent.split('\n').length,
        encoding: 'utf-8',
        ...(validBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: validBranch,
            message: `Used '${validBranch}' instead of '${branch}'`,
          },
        }),
      });
    } catch (error) {
      return createErrorResult(
        `Unexpected error fetching file: ${filePath}`,
        error as Error
      );
    }
  });
}
