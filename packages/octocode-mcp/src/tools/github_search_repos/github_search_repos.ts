import type { GitHubReposSearchQuery } from '@octocodeai/octocode-core';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubReposSearchQuerySchema } from '@octocodeai/octocode-core';
import { searchMultipleGitHubRepos } from './execution.js';
import { GitHubSearchRepositoriesOutputSchema } from '@octocodeai/octocode-core';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerSearchGitHubReposTool =
  createRemoteToolRegistration<GitHubReposSearchQuery>({
    name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    title: 'GitHub Repository Search',
    inputSchema: GitHubReposSearchQuerySchema,
    outputSchema: GitHubSearchRepositoriesOutputSchema,
    executionFn: searchMultipleGitHubRepos,
  });
