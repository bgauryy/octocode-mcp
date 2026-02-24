/**
 * Raw GitHub file content fetching — handles API calls, branch fallback, base64 decoding.
 * Extracted from fileContent.ts to isolate the raw fetch logic.
 *
 * Two fetch strategies:
 *   1. Fast path: raw.githubusercontent.com (no API rate limit cost)
 *   2. Fallback: Octokit repos.getContent (1+ API calls, richer error handling)
 */
import { RequestError } from 'octokit';
import type {
  GetContentParameters,
  GitHubAPIError,
  GitHubAPIResponse,
} from './githubAPI';
import type { FileContentQuery } from '../tools/github_fetch_content/types.js';
import type { GitHubApiFileItem } from '../tools/github_view_repo_structure/scheme.js';
import {
  getOctokit,
  OctokitWithThrottling,
  resolveDefaultBranch,
} from './client';
import { handleGitHubAPIError } from './errors';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { TOOL_NAMES } from '../tools/toolMetadata/index.js';
import { FILE_OPERATION_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import { resolveTokenString } from 'octocode-shared';
import { getServerConfig } from '../serverConfig.js';

const RAW_FETCH_TIMEOUT_MS = 10_000;
const MAX_FILE_SIZE = 300 * 1024;

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Raw content result for caching (before line/match processing) */
export interface RawContentResult {
  rawContent: string;
  branch?: string;
  resolvedRef: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function isGitHubDotCom(): boolean {
  try {
    return getServerConfig().githubApiUrl === 'https://api.github.com';
  } catch {
    return false;
  }
}

async function resolveToken(authInfo?: AuthInfo): Promise<string | null> {
  if (authInfo?.token) return authInfo.token;
  return resolveTokenString();
}

function buildRawGitHubUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string
): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`;
}

async function fileError(
  errorCode: string,
  message: string,
  status: number
): Promise<GitHubAPIError> {
  await logSessionError(TOOL_NAMES.GITHUB_FETCH_CONTENT, errorCode);
  return { error: message, type: 'unknown' as const, status };
}

/** @deprecated No-op. Use clearOctokitInstances() from client.ts instead. */
export function clearDefaultBranchCache(): void {}

// ─────────────────────────────────────────────────────────────────────
// Raw URL fetch (fast path — no API rate limit cost)
// ─────────────────────────────────────────────────────────────────────

async function fetchViaRawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  token: string | null
): Promise<{ content: string; isBinary: boolean } | null> {
  const url = buildRawGitHubUrl(owner, repo, ref, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RAW_FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'octocode-mcp',
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) return null;

    const contentLength = response.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > MAX_FILE_SIZE) return null;

    const isBinary = buffer.indexOf(0) !== -1;
    return { content: buffer.toString('utf-8'), isBinary };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryRawUrlFetch(
  owner: string,
  repo: string,
  filePath: string,
  branch: string | undefined,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<RawContentResult> | null> {
  if (!isGitHubDotCom()) return null;

  const token = await resolveToken(authInfo);
  const ref = branch || (await resolveDefaultBranch(owner, repo, authInfo));
  const rawResult = await fetchViaRawUrl(owner, repo, ref, filePath, token);

  if (!rawResult) return null;

  if (rawResult.isBinary) {
    return fileError(
      FILE_OPERATION_ERRORS.BINARY_FILE.code,
      FILE_OPERATION_ERRORS.BINARY_FILE.message,
      415
    );
  }

  return {
    data: {
      rawContent: rawResult.content,
      branch: branch || undefined,
      resolvedRef: ref,
    },
    status: 200,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Octokit fetch (fallback — full error handling, path suggestions)
// ─────────────────────────────────────────────────────────────────────

async function handleBranch404(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  error: RequestError,
  contentParams: GetContentParameters,
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  authInfo?: AuthInfo
): Promise<
  | {
      result: Awaited<ReturnType<typeof octokit.rest.repos.getContent>>;
      resolvedBranch: string;
    }
  | GitHubAPIError
> {
  const defaultBranch = await resolveDefaultBranch(owner, repo, authInfo);
  const isCommonDefaultGuess = branch === 'main' || branch === 'master';

  if (isCommonDefaultGuess && branch !== defaultBranch) {
    try {
      const result = await octokit.rest.repos.getContent({
        ...contentParams,
        ref: defaultBranch,
      });
      return { result, resolvedBranch: defaultBranch };
    } catch {
      throw error;
    }
  }

  const apiError = handleGitHubAPIError(error);
  if (branch !== defaultBranch) {
    apiError.scopesSuggestion = `Branch '${branch}' not found. Default branch is '${defaultBranch}'. Ask user: Do you want to get the file from '${defaultBranch}' instead?`;
  }

  const pathSuggestions = await findPathSuggestions(
    octokit,
    owner,
    repo,
    filePath,
    branch || defaultBranch
  );
  if (pathSuggestions.length > 0) {
    apiError.hints = [
      ...(apiError.hints || []),
      ...buildPathSuggestionHints(filePath, pathSuggestions),
    ];
  }

  return apiError;
}

async function handle404NoBranch(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  error: RequestError,
  owner: string,
  repo: string,
  filePath: string,
  branch: string | undefined
): Promise<GitHubAPIError> {
  const apiError = handleGitHubAPIError(error);
  const pathSuggestions = await findPathSuggestions(
    octokit,
    owner,
    repo,
    filePath,
    branch || 'main'
  );
  if (pathSuggestions.length > 0) {
    apiError.hints = [
      ...(apiError.hints || []),
      ...buildPathSuggestionHints(filePath, pathSuggestions),
    ];
  }
  return apiError;
}

async function decodeOctokitContent(
  data: { content?: string; size: number; type: string },
  actualBranch: string | undefined,
  branch: string | undefined
): Promise<GitHubAPIResponse<RawContentResult>> {
  const fileSize = data.size || 0;

  if (fileSize > MAX_FILE_SIZE) {
    const fileSizeKB = Math.round(fileSize / 1024);
    const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);
    return fileError(
      FILE_OPERATION_ERRORS.FILE_TOO_LARGE.code,
      FILE_OPERATION_ERRORS.FILE_TOO_LARGE.message(
        fileSizeKB,
        maxSizeKB,
        TOOL_NAMES.GITHUB_SEARCH_CODE
      ),
      413
    );
  }

  const base64Content = data.content?.replace(/\s/g, '');
  if (!base64Content) {
    return fileError(
      FILE_OPERATION_ERRORS.FILE_EMPTY.code,
      FILE_OPERATION_ERRORS.FILE_EMPTY.message,
      404
    );
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    if (buffer.indexOf(0) !== -1) {
      return fileError(
        FILE_OPERATION_ERRORS.BINARY_FILE.code,
        FILE_OPERATION_ERRORS.BINARY_FILE.message,
        415
      );
    }

    decodedContent = buffer.toString('utf-8');
  } catch {
    return fileError(
      FILE_OPERATION_ERRORS.DECODE_FAILED.code,
      FILE_OPERATION_ERRORS.DECODE_FAILED.message,
      422
    );
  }

  return {
    data: {
      rawContent: decodedContent,
      branch: actualBranch || undefined,
      resolvedRef: actualBranch || branch || 'HEAD',
    },
    status: 200,
  };
}

async function fetchViaOctokit(
  owner: string,
  repo: string,
  filePath: string,
  branch: string | undefined,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<RawContentResult>> {
  const octokit = await getOctokit(authInfo);

  const contentParams: GetContentParameters = {
    owner,
    repo,
    path: filePath,
    ...(branch && { ref: branch }),
  };

  let result;
  let actualBranch = branch;

  try {
    result = await octokit.rest.repos.getContent(contentParams);
  } catch (error: unknown) {
    if (!(error instanceof RequestError) || error.status !== 404) throw error;

    if (branch) {
      const fallback = await handleBranch404(
        octokit,
        error,
        contentParams,
        owner,
        repo,
        filePath,
        branch,
        authInfo
      );
      if ('error' in fallback) return fallback;
      result = fallback.result;
      actualBranch = fallback.resolvedBranch;
    } else {
      return handle404NoBranch(octokit, error, owner, repo, filePath, branch);
    }
  }

  const data = result.data;

  if (Array.isArray(data)) {
    return fileError(
      FILE_OPERATION_ERRORS.PATH_IS_DIRECTORY.code,
      FILE_OPERATION_ERRORS.PATH_IS_DIRECTORY.message(
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
      ),
      400
    );
  }

  if ('content' in data && data.type === 'file') {
    return decodeOctokitContent(data, actualBranch, branch);
  }

  return fileError(
    FILE_OPERATION_ERRORS.UNSUPPORTED_TYPE.code,
    FILE_OPERATION_ERRORS.UNSUPPORTED_TYPE.message(data.type),
    415
  );
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetch raw file content from GitHub (for caching).
 * Does NOT apply startLine/endLine/matchString processing — that's done post-cache.
 *
 * Strategy:
 *   1. Try raw.githubusercontent.com (saves API rate limit on github.com)
 *   2. Fall back to Octokit repos.getContent (full error handling)
 */
export async function fetchRawGitHubFileContent(
  params: FileContentQuery,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<RawContentResult>> {
  try {
    const { owner, repo, path: filePath, branch } = params;

    // Fast path: raw.githubusercontent.com (saves the getContent API call;
    // branch resolution still costs 1 API call on cache miss when branch is not provided)
    const rawResult = await tryRawUrlFetch(
      owner,
      repo,
      filePath,
      branch,
      authInfo
    );
    if (rawResult) return rawResult;

    // Fallback: Octokit API (1+ API calls)
    return await fetchViaOctokit(owner, repo, filePath, branch, authInfo);
  } catch (error: unknown) {
    return handleGitHubAPIError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Path suggestion helpers
// ─────────────────────────────────────────────────────────────────────

function buildPathSuggestionHints(
  requestedPath: string,
  suggestions: string[]
): string[] {
  const targetName = requestedPath.split('/').pop() || '';
  const isCaseMismatch = suggestions.some(s => {
    const suggestedName = s.split('/').pop() || '';
    return (
      suggestedName.toLowerCase() === targetName.toLowerCase() &&
      suggestedName !== targetName
    );
  });

  const hints: string[] = [];
  if (isCaseMismatch) {
    hints.push(
      'GitHub Contents API paths are case-sensitive. Verify exact file casing with githubViewRepoStructure.'
    );
  }
  hints.push(`Did you mean: ${suggestions.join(', ')}?`);
  return hints;
}

async function findPathSuggestions(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<string[]> {
  try {
    const parentPath = filePath.split('/').slice(0, -1).join('/');
    const targetName = filePath.split('/').pop();

    if (!targetName) return [];

    const parentContent = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: parentPath,
      ref: branch,
    });

    if (!Array.isArray(parentContent.data)) return [];

    const files = parentContent.data as GitHubApiFileItem[];
    const suggestions: string[] = [];

    const caseMatch = files.find(
      f => f.name.toLowerCase() === targetName.toLowerCase()
    );
    if (caseMatch) suggestions.push(caseMatch.path);

    const nameNoExt = targetName.replace(/\.[^/.]+$/, '');
    const extMatches = files.filter(f => {
      if (f.name === targetName) return false;
      if (f.name.startsWith(nameNoExt + '.')) return true;
      return false;
    });

    extMatches.forEach(f => suggestions.push(f.path));

    return Array.from(new Set(suggestions)).slice(0, 3);
  } catch {
    return [];
  }
}
