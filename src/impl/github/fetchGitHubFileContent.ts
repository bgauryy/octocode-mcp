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
    try {
      let apiPath = `/repos/${params.owner}/${params.repo}/contents/${params.filePath}`;

      // Add ref parameter if branch is provided
      if (params.branch) {
        apiPath += `?ref=${params.branch}`;
      }

      const args = [apiPath, '--jq', '.content'];
      const result = await executeGitHubCommand('api', args, { cache: false });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;
        return createErrorResult(
          `Failed to fetch file: ${params.filePath}`,
          new Error(errorMsg)
        );
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Validate base64 content
      if (!base64Content || base64Content === 'null') {
        return createErrorResult(
          `Empty or invalid file content: ${params.filePath}`,
          new Error('File is empty or binary')
        );
      }

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        return createErrorResult(
          `Failed to decode file content: ${params.filePath}`,
          decodeError as Error
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
        `Unexpected error fetching file: ${params.filePath}`,
        error as Error
      );
    }
  });
}
