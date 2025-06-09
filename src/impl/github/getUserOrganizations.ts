import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';

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

      return {
        content: [
          {
            type: 'text',
            text: `GitHub Organizations for authenticated user:

${output}

 IMPORTANT: Use any of these organization names as the 'owner' parameter in other search tools:
- search_github_code
- search_github_repos
- search_github_commits
- search_github_pull_requests
- fetch_github_file_content
- view_repository

Example: If you see a private repository in the list above, use the organization name as the 'owner' to filter results to that organization.
If the search for code or repositories by owner fails, try searching without an owner filter`,
          },
        ],
        isError: false,
      };
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
