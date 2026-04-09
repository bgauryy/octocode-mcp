import type { GitHubCodeSearchQuery } from './types.js';
import { TOOL_NAMES } from '@octocodeai/octocode-core';
import { GitHubCodeSearchBulkQuerySchema } from '@octocodeai/octocode-core';
import { searchMultipleGitHubCode } from './execution.js';
import { GitHubSearchCodeOutputSchema } from '@octocodeai/octocode-core';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerGitHubSearchCodeTool =
  createRemoteToolRegistration<GitHubCodeSearchQuery>({
    name: TOOL_NAMES.GITHUB_SEARCH_CODE,
    title: 'GitHub Code Search',
    inputSchema: GitHubCodeSearchBulkQuerySchema,
    outputSchema: GitHubSearchCodeOutputSchema,
    executionFn: searchMultipleGitHubCode,
  });
