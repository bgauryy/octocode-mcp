import type { GitHubPullRequestSearchQuery } from '@octocodeai/octocode-core';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubPullRequestSearchBulkQuerySchema } from '@octocodeai/octocode-core';
import { searchMultipleGitHubPullRequests } from './execution.js';
import { GitHubSearchPullRequestsOutputSchema } from '@octocodeai/octocode-core';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerSearchGitHubPullRequestsTool =
  createRemoteToolRegistration<GitHubPullRequestSearchQuery>({
    name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    title: 'GitHub Pull Request Search',
    inputSchema: GitHubPullRequestSearchBulkQuerySchema,
    outputSchema: GitHubSearchPullRequestsOutputSchema,
    executionFn: searchMultipleGitHubPullRequests,
  });
