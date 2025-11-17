import { RequestError } from 'octokit';
import type { GetContentParameters, GitHubAPIResponse } from './githubAPI';
import type {
  FileContentQuery,
  ContentResult,
  GitHubViewRepoStructureQuery,
} from '../types';
import type {
  GitHubApiFileItem,
  GitHubRepositoryStructureResult,
  GitHubRepositoryStructureError,
} from '../scheme/github_view_repo_structure';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContent } from 'octocode-utils';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreDir, shouldIgnoreFile } from '../utils/fileFilters';

export async function fetchGitHubFileContentAPI(
  params: FileContentQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubAPIResponse<ContentResult>> {
  const cacheKey = generateCacheKey(
    'gh-api-file-content',
    {
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      branch: params.branch,
      ...(params.fullContent && { fullContent: params.fullContent }),
      startLine: params.startLine,
      endLine: params.endLine,
      matchString: params.matchString,
      minified: params.minified,
      matchStringContextLines: params.matchStringContextLines,
    },
    sessionId
  );

  const result = await withDataCache<GitHubAPIResponse<ContentResult>>(
    cacheKey,
    async () => {
      return await fetchGitHubFileContentAPIInternal(params, authInfo);
    },
    {
      shouldCache: (value: GitHubAPIResponse<ContentResult>) =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  return result;
}

async function fetchGitHubFileContentAPIInternal(
  params: FileContentQuery,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<ContentResult>> {
  try {
    const octokit = await getOctokit(authInfo);
    const { owner, repo, path: filePath, branch } = params;

    const contentParams: GetContentParameters = {
      owner,
      repo,
      path: filePath,
      ...(branch && { ref: branch }),
    };

    let result;
    try {
      result = await octokit.rest.repos.getContent(contentParams);
    } catch (error: unknown) {
      // Handle 404 errors with smart fallback/hints
      if (error instanceof RequestError && error.status === 404 && branch) {
        // Silent fallback: main -> master OR master -> main
        if (branch === 'main' || branch === 'master') {
          const fallbackBranch = branch === 'main' ? 'master' : 'main';
          try {
            result = await octokit.rest.repos.getContent({
              ...contentParams,
              ref: fallbackBranch,
            });
          } catch {
            // If fallback fails, throw the original error
            throw error;
          }
        } else {
          // For specific branches (not main/master), add helpful hint
          const apiError = handleGitHubAPIError(error);
          return {
            ...apiError,
            scopesSuggestion: `Branch '${branch}' not found. Ask user: Do you want to get the file from the default branch instead?`,
          };
        }
      } else {
        throw error;
      }
    }

    const data = result.data;

    if (Array.isArray(data)) {
      return {
        error:
          'Path is a directory. Use githubViewRepoStructure to list directory contents',
        type: 'unknown' as const,
        status: 400,
      };
    }

    if ('content' in data && data.type === 'file') {
      const fileSize = data.size || 0;
      const MAX_FILE_SIZE = 300 * 1024;

      if (fileSize > MAX_FILE_SIZE) {
        const fileSizeKB = Math.round(fileSize / 1024);
        const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

        return {
          error: `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
          type: 'unknown' as const,
          status: 413,
        };
      }

      if (!data.content) {
        return {
          error: 'File is empty - no content to display',
          type: 'unknown' as const,
          status: 404,
        };
      }

      const base64Content = data.content.replace(/\s/g, '');

      if (!base64Content) {
        return {
          error: 'File is empty - no content to display',
          type: 'unknown' as const,
          status: 404,
        };
      }

      let decodedContent: string;
      try {
        const buffer = Buffer.from(base64Content, 'base64');

        if (buffer.indexOf(0) !== -1) {
          return {
            error:
              'Binary file detected. Cannot display as text - download directly from GitHub',
            type: 'unknown' as const,
            status: 415,
          };
        }

        decodedContent = buffer.toString('utf-8');
      } catch (decodeError) {
        return {
          error:
            'Failed to decode file. Encoding may not be supported (expected UTF-8)',
          type: 'unknown' as const,
          status: 422,
        };
      }

      const result = await processFileContentAPI(
        decodedContent,
        owner,
        repo,
        branch || data.sha,
        filePath,
        params.minified !== false,
        params.fullContent || false,
        params.startLine,
        params.endLine,
        params.matchStringContextLines ?? 5,
        params.matchString
      );

      if ('error' in result) {
        return {
          error: result.error || 'Unknown error',
          status: 500,
          type: 'unknown' as const,
        };
      } else {
        return {
          data: result,
          status: 200,
        };
      }
    }

    return {
      error: `Unsupported file type: ${data.type}`,
      type: 'unknown' as const,
      status: 415,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return apiError;
  }
}

async function processFileContentAPI(
  decodedContent: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  minified: boolean,
  fullContent: boolean,
  startLine?: number,
  endLine?: number,
  matchStringContextLines: number = 5,
  matchString?: string
): Promise<ContentResult> {
  const sanitizationResult = ContentSanitizer.sanitizeContent(decodedContent);
  decodedContent = sanitizationResult.content;

  const securityWarningsSet = new Set<string>();
  if (sanitizationResult.hasSecrets) {
    securityWarningsSet.add(
      `Secrets detected and redacted: ${sanitizationResult.secretsDetected.join(', ')}`
    );
  }
  if (sanitizationResult.hasPromptInjection) {
    securityWarningsSet.add(
      'Potential prompt injection detected and sanitized'
    );
  }
  if (sanitizationResult.isMalicious) {
    securityWarningsSet.add(
      'Potentially malicious content detected and sanitized'
    );
  }
  if (sanitizationResult.warnings.length > 0) {
    sanitizationResult.warnings.forEach(warning =>
      securityWarningsSet.add(warning)
    );
  }
  const securityWarnings = Array.from(securityWarningsSet);

  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;

  const lines = decodedContent.split('\n');
  const totalLines = lines.length;

  if (fullContent) {
    finalContent = decodedContent;
  } else if (matchString) {
    const matchingLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(matchString)) {
        matchingLines.push(i + 1);
      }
    }

    if (matchingLines.length === 0) {
      return {
        error: `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
        hints: [
          `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
        ],
      };
    }

    const firstMatch = matchingLines[0]!;
    const matchStartLine = Math.max(1, firstMatch - matchStringContextLines);
    const matchEndLine = Math.min(
      totalLines,
      firstMatch + matchStringContextLines
    );

    startLine = matchStartLine;
    endLine = matchEndLine;

    const selectedLines = lines.slice(matchStartLine - 1, matchEndLine);
    finalContent = selectedLines.join('\n');

    actualStartLine = matchStartLine;
    actualEndLine = matchEndLine;
    isPartial = true;

    securityWarnings.push(
      `Found "${matchString}" on line ${firstMatch}${matchingLines.length > 1 ? ` (and ${matchingLines.length - 1} other locations)` : ''}`
    );
  } else if (startLine !== undefined || endLine !== undefined) {
    const effectiveStartLine = startLine || 1;

    const effectiveEndLine = endLine || totalLines;

    if (effectiveStartLine < 1 || effectiveStartLine > totalLines) {
      finalContent = decodedContent;
    } else if (effectiveEndLine < effectiveStartLine) {
      finalContent = decodedContent;
    } else {
      const adjustedStartLine = Math.max(1, effectiveStartLine);
      const adjustedEndLine = Math.min(totalLines, effectiveEndLine);

      const selectedLines = lines.slice(adjustedStartLine - 1, adjustedEndLine);

      actualStartLine = adjustedStartLine;
      actualEndLine = adjustedEndLine;
      isPartial = true;

      finalContent = selectedLines.join('\n');

      if (effectiveEndLine > totalLines) {
        securityWarnings.push(
          `Requested endLine ${effectiveEndLine} adjusted to ${totalLines} (file end)`
        );
      }
    }
  }

  let minificationFailed = false;
  let minificationType = 'none';

  if (minified) {
    const minifyResult = await minifyContent(finalContent, filePath);
    finalContent = minifyResult.content;
    minificationFailed = minifyResult.failed;
    minificationType = minifyResult.type;
  }

  return {
    owner,
    repo,
    path: filePath,
    contentLength: finalContent.length,
    content: finalContent,
    branch,
    ...(isPartial && {
      startLine: actualStartLine,
      endLine: actualEndLine,
      isPartial,
    }),
    ...(minified && {
      minified: !minificationFailed,
      minificationFailed: minificationFailed,
      minificationType: minificationType,
    }),
    ...(securityWarnings.length > 0 && {
      securityWarnings,
    }),
  } as ContentResult;
}

export async function viewGitHubRepositoryStructureAPI(
  params: GitHubViewRepoStructureQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  const cacheKey = generateCacheKey('gh-repo-structure-api', params, sessionId);

  const result = await withDataCache<
    GitHubRepositoryStructureResult | GitHubRepositoryStructureError
  >(
    cacheKey,
    async () => {
      return await viewGitHubRepositoryStructureAPIInternal(params, authInfo);
    },
    {
      shouldCache: value => !('error' in value),
    }
  );

  return result;
}

async function viewGitHubRepositoryStructureAPIInternal(
  params: GitHubViewRepoStructureQuery,
  authInfo?: AuthInfo
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  try {
    const octokit = await getOctokit(authInfo);
    const { owner, repo, branch, path = '', depth = 1 } = params;

    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    let result;
    let workingBranch = branch;
    try {
      result = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: cleanPath || undefined,
        ref: branch,
      });
    } catch (error: unknown) {
      if (error instanceof RequestError && error.status === 404) {
        let defaultBranch = 'main';
        try {
          const repoInfo = await octokit.rest.repos.get({ owner, repo });
          defaultBranch = repoInfo.data.default_branch || 'main';
        } catch (repoError) {
          const apiError = handleGitHubAPIError(repoError);
          return {
            error: `Repository "${owner}/${repo}" not found or not accessible: ${apiError.error}`,
            status: apiError.status,
          };
        }

        if (defaultBranch !== branch) {
          try {
            result = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: cleanPath || undefined,
              ref: defaultBranch,
            });
            workingBranch = defaultBranch;
          } catch (fallbackError) {
            const commonBranches = ['main', 'master', 'develop'];
            let foundBranch = null;

            for (const tryBranch of commonBranches) {
              if (tryBranch === branch || tryBranch === defaultBranch) continue;

              try {
                result = await octokit.rest.repos.getContent({
                  owner,
                  repo,
                  path: cleanPath || undefined,
                  ref: tryBranch,
                });
                foundBranch = tryBranch;
                workingBranch = tryBranch;
                break;
              } catch {
                //ignore
              }
            }

            if (!foundBranch) {
              const apiError = handleGitHubAPIError(error);
              return {
                error: `Path "${cleanPath}" not found in repository "${owner}/${repo}" on any common branch`,
                status: apiError.status,
                triedBranches: [branch, defaultBranch, ...commonBranches],
                defaultBranch,
              };
            }
          }
        } else {
          const apiError = handleGitHubAPIError(error);
          return {
            error: `Path "${cleanPath}" not found in repository "${owner}/${repo}" on branch "${branch}"`,
            status: apiError.status,
          };
        }
      } else {
        const apiError = handleGitHubAPIError(error);
        return {
          error: `Failed to access repository "${owner}/${repo}": ${apiError.error}`,
          status: apiError.status,
          rateLimitRemaining: apiError.rateLimitRemaining,
          rateLimitReset: apiError.rateLimitReset,
        };
      }
    }

    const items = Array.isArray(result.data) ? result.data : [result.data];

    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    let allItems = apiItems;
    if (depth > 1) {
      const recursiveItems = await fetchDirectoryContentsRecursivelyAPI(
        octokit,
        owner,
        repo,
        workingBranch,
        cleanPath,
        1,
        depth
      );

      const combinedItems = [...apiItems, ...recursiveItems];
      allItems = combinedItems.filter(
        (item, index, array) =>
          array.findIndex(i => i.path === item.path) === index
      );
    }

    const filteredItems = allItems.filter(item => {
      if (item.type === 'dir') {
        return !shouldIgnoreDir(item.name);
      }
      return !shouldIgnoreFile(item.path);
    });

    const itemLimit = Math.min(200, 50 * depth);
    const limitedItems = filteredItems.slice(0, itemLimit);

    limitedItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }

      const aDepth = a.path.split('/').length;
      const bDepth = b.path.split('/').length;

      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }

      return a.path.localeCompare(b.path);
    });

    const files = limitedItems
      .filter(item => item.type === 'file')
      .map(item => ({
        path: item.path.startsWith('/') ? item.path : `/${item.path}`,
        size: item.size,
        url: item.path,
      }));

    const folders = limitedItems
      .filter(item => item.type === 'dir')
      .map(item => ({
        path: item.path.startsWith('/') ? item.path : `/${item.path}`,
        url: item.path,
      }));

    return {
      owner,
      repo,
      branch: workingBranch,
      path: cleanPath || '/',
      apiSource: true,
      summary: {
        totalFiles: files.length,
        totalFolders: folders.length,
        truncated: allItems.length > limitedItems.length,
        filtered: true,
        originalCount: allItems.length,
      },
      files: files,
      folders: {
        count: folders.length,
        folders: folders,
      },
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `API request failed: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
    };
  }
}

/**
 * Recursively fetch directory contents using API
 */
async function fetchDirectoryContentsRecursivelyAPI(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string> = new Set()
): Promise<GitHubApiFileItem[]> {
  // Prevent infinite loops and respect depth limits
  if (currentDepth > maxDepth || visitedPaths.has(path)) {
    return [];
  }

  visitedPaths.add(path);

  try {
    const result = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: path || undefined,
      ref: branch,
    });

    const items = Array.isArray(result.data) ? result.data : [result.data];
    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    const allItems: GitHubApiFileItem[] = [...apiItems];

    // If we haven't reached max depth, recursively fetch subdirectories
    if (currentDepth < maxDepth) {
      const directories = apiItems.filter(item => item.type === 'dir');

      // Limit concurrent requests to avoid rate limits
      const concurrencyLimit = 3;
      for (let i = 0; i < directories.length; i += concurrencyLimit) {
        const batch = directories.slice(i, i + concurrencyLimit);

        const promises = batch.map(async dir => {
          try {
            const subItems = await fetchDirectoryContentsRecursivelyAPI(
              octokit,
              owner,
              repo,
              branch,
              dir.path,
              currentDepth + 1,
              maxDepth,
              new Set(visitedPaths) // Pass a copy to avoid shared state issues
            );
            return subItems;
          } catch (error) {
            // Silently fail on individual directory errors
            return [];
          }
        });

        const results = await Promise.all(promises);
        results.forEach(subItems => {
          allItems.push(...subItems);
        });
      }
    }

    return allItems;
  } catch (error) {
    return [];
  }
}
