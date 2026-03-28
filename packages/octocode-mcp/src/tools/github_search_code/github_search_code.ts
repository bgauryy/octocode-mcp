import type { GitHubCodeSearchQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubCodeSearchBulkQuerySchema } from './scheme.js';
import { searchMultipleGitHubCode } from './execution.js';
import { GitHubSearchCodeOutputSchema } from '../../scheme/outputSchemas.js';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerGitHubSearchCodeTool =
  createRemoteToolRegistration<GitHubCodeSearchQuery>({
    name: TOOL_NAMES.GITHUB_SEARCH_CODE,
    title: 'GitHub Code Search',
    inputSchema: GitHubCodeSearchBulkQuerySchema,
    outputSchema: GitHubSearchCodeOutputSchema,
    executionFn: searchMultipleGitHubCode,
  });
