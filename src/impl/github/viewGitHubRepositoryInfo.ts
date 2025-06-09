import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  GitHubRepositoryViewParams,
  GitHubRepositoryViewResult,
} from '../../types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createErrorResult, createSuccessResult } from '../util';
import { executeGitHubCommand } from '../../utils/exec';

export async function viewGitHubRepositoryInfo(
  params: GitHubRepositoryViewParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-view', params);

  return withCache(cacheKey, async () => {
    try {
      const owner = params.owner || '';
      const args = ['view', `${owner}/${params.repo}`];
      const result = await executeGitHubCommand('repo', args, { cache: false });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const viewResult: GitHubRepositoryViewResult = {
        owner,
        repo: params.repo,
        repositoryInfo: content,
        rawOutput: content,
      };

      return createSuccessResult(viewResult);
    } catch (error) {
      return createErrorResult('Failed to view GitHub repository', error);
    }
  });
}
