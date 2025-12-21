import type {
  SearchCodeParameters,
  SearchCodeResponse,
  CodeSearchResultItem,
  GitHubAPIResponse,
  OptimizedCodeSearchResult,
} from './githubAPI';
import { GitHubCodeSearchQuery } from '../types';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContent } from '../utils/minifier/index.js';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildCodeSearchQuery } from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreFile } from '../utils/fileFilters';
import { SEARCH_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { isSanitizeEnabled } from '../serverConfig.js';

export async function searchGitHubCodeAPI(
  params: GitHubCodeSearchQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubAPIResponse<OptimizedCodeSearchResult>> {
  const cacheKey = generateCacheKey('gh-api-code', params, sessionId);

  const result = await withDataCache<
    GitHubAPIResponse<OptimizedCodeSearchResult>
  >(
    cacheKey,
    async () => {
      return await searchGitHubCodeAPIInternal(params, authInfo);
    },
    {
      shouldCache: (value: GitHubAPIResponse<OptimizedCodeSearchResult>) =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  return result;
}

async function searchGitHubCodeAPIInternal(
  params: GitHubCodeSearchQuery,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<OptimizedCodeSearchResult>> {
  try {
    const octokit = await getOctokit(authInfo);

    if (params.keywordsToSearch && params.keywordsToSearch.length > 0) {
      const validTerms = params.keywordsToSearch.filter(
        term => term && term.trim()
      );
      if (validTerms.length === 0) {
        await logSessionError(
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          SEARCH_ERRORS.QUERY_EMPTY.code
        );
        return {
          error: SEARCH_ERRORS.QUERY_EMPTY.message,
          type: 'http',
          status: 400,
        };
      }
    }

    const query = buildCodeSearchQuery(params);

    if (!query.trim()) {
      await logSessionError(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        SEARCH_ERRORS.QUERY_EMPTY.code
      );
      return {
        error: SEARCH_ERRORS.QUERY_EMPTY.message,
        type: 'http',
        status: 400,
      };
    }

    const searchParams: SearchCodeParameters = {
      q: query,
      per_page: Math.min(
        typeof params.limit === 'number' ? params.limit : 30,
        100
      ),
      page: 1,
      headers: {
        Accept: 'application/vnd.github.v3.text-match+json',
      },
    };

    const result = await octokit.rest.search.code(searchParams);

    const optimizedResult = await convertCodeSearchResult(
      result,
      params.minify !== false,
      isSanitizeEnabled()
    );

    return {
      data: {
        total_count: optimizedResult.total_count,
        items: optimizedResult.items,
        repository: optimizedResult.repository,
        securityWarnings: optimizedResult.securityWarnings,
        minified: optimizedResult.minified,
        minificationFailed: optimizedResult.minificationFailed,
        minificationTypes: optimizedResult.minificationTypes,
        _researchContext: optimizedResult._researchContext,
      },
      status: 200,
      headers: result.headers,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return apiError;
  }
}

async function convertCodeSearchResult(
  octokitResult: SearchCodeResponse,
  minify: boolean = true,
  sanitize: boolean = true
): Promise<OptimizedCodeSearchResult> {
  const items: CodeSearchResultItem[] = octokitResult.data.items;

  return transformToOptimizedFormat(items, minify, sanitize);
}

async function transformToOptimizedFormat(
  items: CodeSearchResultItem[],
  minify: boolean,
  sanitize: boolean
): Promise<OptimizedCodeSearchResult> {
  const singleRepo = extractSingleRepository(items);

  const allSecurityWarningsSet = new Set<string>();
  let hasMinificationFailures = false;
  const minificationTypes: string[] = [];

  const foundFiles = new Set<string>();

  const filteredItems = items.filter(item => !shouldIgnoreFile(item.path));

  const optimizedItems = await Promise.all(
    filteredItems.map(async item => {
      foundFiles.add(item.path);

      const processedMatches = await Promise.all(
        (item.text_matches || []).map(async match => {
          let processedFragment = match.fragment;

          if (sanitize) {
            const sanitizationResult = ContentSanitizer.sanitizeContent(
              processedFragment || ''
            );
            processedFragment = sanitizationResult.content;

            if (sanitizationResult.hasSecrets) {
              allSecurityWarningsSet.add(
                `Secrets detected in ${item.path}: ${sanitizationResult.secretsDetected.join(', ')}`
              );
            }
            if (sanitizationResult.warnings.length > 0) {
              sanitizationResult.warnings.forEach(w =>
                allSecurityWarningsSet.add(`${item.path}: ${w}`)
              );
            }
          }

          if (minify) {
            const minifyResult = await minifyContent(
              processedFragment || '',
              item.path
            );
            processedFragment = minifyResult.content;

            if (minifyResult.failed) {
              hasMinificationFailures = true;
            } else if (minifyResult.type !== 'failed') {
              minificationTypes.push(minifyResult.type);
            }
          }

          return {
            context: processedFragment || '',
            positions:
              match.matches?.map(m =>
                Array.isArray(m.indices) && m.indices.length >= 2
                  ? ([m.indices[0], m.indices[1]] as [number, number])
                  : ([0, 0] as [number, number])
              ) || [],
          };
        })
      );

      return {
        path: item.path,
        matches: processedMatches,
        url: singleRepo ? item.path : item.url,
        repository: {
          nameWithOwner: item.repository.full_name,
          url: item.repository.url,
          pushedAt: item.repository.pushed_at || undefined,
        },
        ...(minify &&
          minificationTypes.length > 0 && {
            minificationType: Array.from(new Set(minificationTypes)).join(','),
          }),
      };
    })
  );

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: filteredItems.length,
    _researchContext: {
      foundFiles: Array.from(foundFiles),
      repositoryContext: singleRepo
        ? (() => {
            const parts = singleRepo.full_name.split('/');
            return parts.length === 2 && parts[0] && parts[1]
              ? { owner: parts[0], repo: parts[1] }
              : undefined;
          })()
        : undefined,
    },
  };

  if (singleRepo) {
    result.repository = {
      name: singleRepo.full_name,
      url: singleRepo.url,
      createdAt: singleRepo.created_at || undefined,
      updatedAt: singleRepo.updated_at || undefined,
      pushedAt: singleRepo.pushed_at || undefined,
    };
  }

  if (sanitize && allSecurityWarningsSet.size > 0) {
    result.securityWarnings = Array.from(allSecurityWarningsSet);
  }

  if (minify) {
    result.minified = !hasMinificationFailures;
    result.minificationFailed = hasMinificationFailures;
    if (minificationTypes.length > 0) {
      result.minificationTypes = Array.from(new Set(minificationTypes));
    }
  }

  return result;
}

function extractSingleRepository(items: CodeSearchResultItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0]?.repository;
  if (!firstRepo) return null;
  const allSameRepo = items.every(
    item => item.repository.full_name === firstRepo.full_name
  );

  return allSameRepo ? firstRepo : null;
}
