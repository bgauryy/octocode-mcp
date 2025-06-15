import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { createSuccessResult } from '../util';

export async function getUserOrganizations(params: {
  limit?: number;
}): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-orgs', params);

  return withCache(cacheKey, async () => {
    try {
      const limit = params.limit || 30;
      const args = ['list', `--limit=${limit}`];
      const result = await executeGitHubCommand('org', args, { cache: false });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const output = execResult.result;

      // Parse organizations into clean array
      const organizations = output
        .split('\n')
        .map((org: string) => org.trim())
        .filter((org: string) => org.length > 0);

      return createSuccessResult({
        organizations,
        count: organizations.length,
        usage: {
          note: "Use organization names as 'owner' parameter in other GitHub search tools",
          tools: [
            'github_search_code',
            'github_search_repositories',
            'github_search_commits',
            'github_search_pull_requests',
            'github_get_file_content',
            'github_get_contents',
          ],
        },
      });
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get user organizations: ${(error as Error).message}

Make sure you are authenticated with GitHub CLI (gh auth login) and have access to organizations.`,
          },
        ],
        isError: true,
      };
    }
  });
}
