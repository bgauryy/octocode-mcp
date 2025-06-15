import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GithubFetchRequestParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    try {
      let apiPath = `/repos/${params.owner}/${params.repo}/contents/${params.filePath}`;

      // Add ref parameter if branch is provided
      if (params.branch) {
        apiPath += `?ref=${params.branch}`;
      }

      const args = [apiPath, '--jq', '.content'];
      const result = await executeGitHubCommand('api', args, { cache: false });

      if (result.isError) {
        // Parse the error message to provide better context
        const errorMsg = result.content[0].text as string;

        // Handle common GitHub API errors
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          return createErrorResult(
            `File not found: ${params.filePath} in ${params.owner}/${params.repo}${params.branch ? ` on branch '${params.branch}'` : ''}`,
            new Error(
              `Use github_get_contents to explore repository structure or github_search_code to find files by pattern. Query: filename:${params.filePath.split('/').pop()} repo:${params.owner}/${params.repo}`
            )
          );
        }

        if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createErrorResult(
            `Access denied: ${params.filePath} in ${params.owner}/${params.repo}`,
            new Error(
              `Repository may be private. Use github_get_user_organizations to check access or authenticate with 'gh auth login'`
            )
          );
        }

        // Handle rate limiting
        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          return createErrorResult(
            'GitHub API rate limit exceeded',
            new Error(
              `Wait and retry. Use github_search_code instead of direct file access to reduce API calls`
            )
          );
        }

        // Generic error fallback
        return createErrorResult(
          `GitHub API error for ${params.filePath}`,
          new Error(
            `${errorMsg}. Use github_get_contents to explore repository structure first`
          )
        );
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Validate base64 content
      if (!base64Content || base64Content === 'null') {
        return createErrorResult(
          `Empty file content: ${params.filePath}`,
          new Error(
            `File exists but empty or binary. Use github_search_code to find content by pattern or check different file`
          )
        );
      }

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        return createErrorResult(
          `Decode error: ${params.filePath}`,
          new Error(
            `${(decodeError as Error).message}. File may be binary. Use github_search_code for text-based content`
          )
        );
      }

      return createSuccessResult({
        filePath: params.filePath,
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        content: decodedContent,
        size: decodedContent.length,
        encoding: 'utf-8',
      });
    } catch (error) {
      return createErrorResult(
        `Unexpected error: ${params.filePath}`,
        new Error(
          `${(error as Error).message}. Workflow: github_get_contents → github_search_code → github_get_file_content`
        )
      );
    }
  });
}
