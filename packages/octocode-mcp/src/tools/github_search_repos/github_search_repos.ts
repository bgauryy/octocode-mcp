import type { GitHubReposSearchQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubReposSearchQuerySchema } from './scheme.js';
import { searchMultipleGitHubRepos } from './execution.js';
import { GitHubSearchRepositoriesOutputSchema } from '../../scheme/outputSchemas.js';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerSearchGitHubReposTool =
  createRemoteToolRegistration<GitHubReposSearchQuery>({
    name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    title: 'GitHub Repository Search',
    inputSchema: GitHubReposSearchQuerySchema,
    outputSchema: GitHubSearchRepositoriesOutputSchema,
    executionFn: searchMultipleGitHubRepos,
  });
