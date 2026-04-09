import type { FileContentQuery } from './types.js';
import { TOOL_NAMES } from '@octocodeai/octocode-core';
import { FileContentBulkQuerySchema } from '@octocodeai/octocode-core';
import { fetchMultipleGitHubFileContents } from './execution.js';
import { GitHubFetchContentOutputSchema } from '@octocodeai/octocode-core';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerFetchGitHubFileContentTool =
  createRemoteToolRegistration<FileContentQuery>({
    name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
    title: 'GitHub File Content Fetch',
    inputSchema: FileContentBulkQuerySchema,
    outputSchema: GitHubFetchContentOutputSchema,
    executionFn: fetchMultipleGitHubFileContents,
    annotations: { readOnlyHint: false },
  });
