import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { GithubFetchRequestParams } from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import {
  createSuccessResult,
  createOptimizedError,
  analyzeGitHubError,
} from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file', params);

  return withCache(cacheKey, async () => {
    try {
      const command = 'gh';
      const args = [
        'api',
        `repos/${params.owner}/${params.repo}/contents/${params.filePath}`,
        ...(params.branch ? ['--field', `ref=${params.branch}`] : []),
        '--jq',
        '.content',
      ];

      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;
        const analysis = analyzeGitHubError(errorMsg);
        return createOptimizedError(
          `File fetch ${params.filePath}`,
          errorMsg,
          analysis.suggestions
        );
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Validate base64 content
      if (!base64Content || base64Content === 'null') {
        return createOptimizedError(
          `File content ${params.filePath}`,
          'Empty or binary file',
          [
            `${TOOL_NAMES.GITHUB_SEARCH_CODE} to find content`,
            'check different file',
          ]
        );
      }

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        return createOptimizedError(
          `File decode ${params.filePath}`,
          (decodeError as Error).message,
          [
            'file may be binary',
            `${TOOL_NAMES.GITHUB_SEARCH_CODE} for text content`,
          ]
        );
      }

      return createSuccessResult({
        filePath: params.filePath,
        owner: params.owner,
        repo: params.repo,
        content: decodedContent,
        size: decodedContent.length,
        nextSteps: [
          `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${params.filePath.split('/').pop()}" repo:${params.owner}/${params.repo}`,
          `${TOOL_NAMES.GITHUB_GET_CONTENTS} "${params.owner}/${params.repo}" path:${params.filePath.split('/').slice(0, -1).join('/')}`,
          `${TOOL_NAMES.NPM_SEARCH_PACKAGES} "${params.owner}"`,
        ],
      });
    } catch (error) {
      const analysis = analyzeGitHubError((error as Error).message);
      return createOptimizedError(
        `File fetch ${params.filePath}`,
        (error as Error).message,
        analysis.suggestions
      );
    }
  });
}
