import type {
  GitHubFileContentApiResult,
  FileContentExecutionQuery,
} from '../tools/github_fetch_content/types.js';
import {
  paginateContentWindow,
  pageFields,
  fullContentLimit,
} from '../utils/file/contentPagination.js';
import { OctokitWithThrottling } from './client.js';

interface FileTimestampInfo {
  lastModified: string;
  lastModifiedBy: string;
}

export async function applyContentPagination(
  data: GitHubFileContentApiResult,
  query: FileContentExecutionQuery
): Promise<GitHubFileContentApiResult> {
  const content = data.content ?? '';
  const limited = fullContentLimit(
    query,
    content,
    data.totalLines ?? 0,
    'ghGetFileContent'
  );
  if (limited) {
    return {
      ...data,
      content: '',
      errorCode: 'fullContentLimit',
      isPartial: true,
      partialReasons: ['full-content-size-limit'],
      next: limited.next,
    };
  }
  const page = await paginateContentWindow(content, query, 'ghGetFileContent');
  const pageLines = data.sourceLines?.slice(
    page.firstViewLine - 1,
    page.lastViewLine
  );
  return {
    ...data,
    ...pageFields(page),
    ...(data.matchedLines
      ? {
          matchedLines: data.matchedLines.filter(line =>
            pageLines?.includes(line)
          ),
        }
      : {}),
  };
}

export async function fetchFileTimestamp(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  path: string,
  branch?: string
): Promise<FileTimestampInfo | null> {
  try {
    const commits = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path,
      per_page: 1,
      ...(branch && { sha: branch }),
    });

    if (commits.data.length > 0) {
      const lastCommit = commits.data[0];
      const commitDate = lastCommit?.commit?.committer?.date;
      const authorName =
        lastCommit?.commit?.author?.name ||
        lastCommit?.author?.login ||
        'Unknown';

      return {
        lastModified: commitDate || 'Unknown',
        lastModifiedBy: authorName,
      };
    }
    return null;
  } catch {
    return null;
  }
}
