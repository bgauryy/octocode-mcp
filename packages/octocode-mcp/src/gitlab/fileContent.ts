/**
 * GitLab File Content
 *
 * Fetch file content from GitLab repositories.
 * Note: `ref` parameter is REQUIRED for GitLab (unlike GitHub).
 *
 * @module gitlab/fileContent
 */

import type {
  GitLabAPIResponse,
  GitLabFileContentQuery,
  GitLabFileContent,
} from './types.js';
import { getGitlab } from './client.js';
import { handleGitLabAPIError, createGitLabError } from './errors.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

// ============================================================================
// FILE CONTENT
// ============================================================================

/**
 * Fetch file content from GitLab.
 *
 * @param params - Query parameters
 * @param sessionId - Optional session ID for caching
 * @returns File content
 */
export async function fetchGitLabFileContentAPI(
  params: GitLabFileContentQuery,
  sessionId?: string
): Promise<GitLabAPIResponse<GitLabFileContent>> {
  // Validate required parameters
  if (!params.projectId) {
    return createGitLabError('Project ID is required', 400);
  }

  if (!params.path) {
    return createGitLabError('File path is required', 400);
  }

  if (!params.ref) {
    return createGitLabError(
      'Reference (ref) is required for GitLab file content',
      400,
      [
        'Unlike GitHub, GitLab requires an explicit branch, tag, or commit reference.',
        'Use the default branch name (e.g., "main" or "master") or a specific ref.',
      ]
    );
  }

  // Generate cache key
  const cacheKey = generateCacheKey(
    'gl-api-file',
    {
      projectId: params.projectId,
      path: params.path,
      ref: params.ref,
    },
    sessionId
  );

  return withDataCache<GitLabAPIResponse<GitLabFileContent>>(
    cacheKey,
    async () => fetchGitLabFileContentAPIInternal(params),
    {
      shouldCache: value => 'data' in value && !('error' in value),
    }
  );
}

async function fetchGitLabFileContentAPIInternal(
  params: GitLabFileContentQuery
): Promise<GitLabAPIResponse<GitLabFileContent>> {
  try {
    const gitlab = await getGitlab();

    // URL-encode the file path as required by GitLab API
    const encodedPath = encodeURIComponent(params.path);

    // Fetch file content
    const file = (await gitlab.RepositoryFiles.show(
      params.projectId,
      encodedPath,
      params.ref
    )) as unknown as Record<string, unknown>;

    // Decode base64 content
    let content = String(file.content || '');
    if (file.encoding === 'base64') {
      content = Buffer.from(content, 'base64').toString('utf-8');
    }

    // Apply line filtering if requested
    if (params.startLine !== undefined || params.endLine !== undefined) {
      const lines = content.split('\n');
      const start = (params.startLine ?? 1) - 1; // Convert to 0-indexed
      const end = params.endLine ?? lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return {
      data: {
        file_name: String(file.file_name || ''),
        file_path: String(file.file_path || ''),
        size: Number(file.size || 0),
        encoding: 'utf-8', // We decoded it
        content,
        content_sha256: String(file.content_sha256 || ''),
        ref: String(file.ref || ''),
        blob_id: String(file.blob_id || ''),
        commit_id: String(file.commit_id || ''),
        last_commit_id: String(file.last_commit_id || ''),
        execute_filemode: Boolean(file.execute_filemode),
      },
      status: 200,
    };
  } catch (error) {
    return handleGitLabAPIError(error);
  }
}

/**
 * Get the default branch for a GitLab project.
 *
 * @param projectId - Project ID
 * @returns Default branch name
 */
export async function getGitLabDefaultBranch(
  projectId: number | string
): Promise<string> {
  try {
    const gitlab = await getGitlab();
    const project = (await gitlab.Projects.show(
      projectId
    )) as unknown as Record<string, unknown>;
    return String(project.default_branch || 'main');
  } catch {
    return 'main';
  }
}

/**
 * Check if a file exists in a GitLab repository.
 *
 * @param projectId - Project ID
 * @param path - File path
 * @param ref - Branch/tag/commit reference
 * @returns True if file exists
 */
export async function gitLabFileExists(
  projectId: number | string,
  path: string,
  ref: string
): Promise<boolean> {
  try {
    const gitlab = await getGitlab();
    const encodedPath = encodeURIComponent(path);
    await gitlab.RepositoryFiles.show(projectId, encodedPath, ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transform GitLab file content to unified format.
 */
export function transformGitLabFileContent(file: GitLabFileContent): {
  path: string;
  content: string;
  encoding: string;
  size: number;
  ref: string;
  lastCommitId: string;
} {
  return {
    path: file.file_path,
    content: file.content,
    encoding: file.encoding,
    size: file.size,
    ref: file.ref,
    lastCommitId: file.last_commit_id,
  };
}
