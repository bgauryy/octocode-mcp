import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GithubFetchRequestParams } from '../../types';
import { createErrorResult } from '../util';

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
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        throw new Error(
          `Failed to decode base64 content: ${(decodeError as Error).message}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: decodedContent,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResult('Failed to retrieve file content', error);
    }
  });
}
