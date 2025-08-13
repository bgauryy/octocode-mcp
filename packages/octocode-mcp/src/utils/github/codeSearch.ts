import type {
  SearchCodeParameters,
  SearchCodeResponse,
  CodeSearchResultItem,
  GitHubAPIResponse,
  OptimizedCodeSearchResult,
} from '../../types/github-openapi';
import { GitHubCodeSearchQuery } from '../../mcp/tools/scheme/github_search_code';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { minifyContent } from 'octocode-utils';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildCodeSearchQuery, applyQualityBoost } from './queryBuilders';
import { generateCacheKey, withDataCache } from '../cache';

/**
 * Search GitHub code using Octokit API with optimized performance and caching
 * Token management is handled internally by the GitHub client
 */
export async function searchGitHubCodeAPI(
  params: GitHubCodeSearchQuery
): Promise<GitHubAPIResponse<OptimizedCodeSearchResult>> {
  const cacheKey = generateCacheKey('gh-api-code', params);

  const result = await withDataCache<
    GitHubAPIResponse<OptimizedCodeSearchResult>
  >(
    cacheKey,
    async () => {
      return await searchGitHubCodeAPIInternal(params);
    },
    {
      // Only cache successful responses
      shouldCache: (value: GitHubAPIResponse<OptimizedCodeSearchResult>) =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  return result;
}

/**
 * Internal implementation of searchGitHubCodeAPI without caching
 * Token management is handled internally by the GitHub client
 */
async function searchGitHubCodeAPIInternal(
  params: GitHubCodeSearchQuery
): Promise<GitHubAPIResponse<OptimizedCodeSearchResult>> {
  try {
    const octokit = await getOctokit();

    // Apply quality boosting for better relevance
    const enhancedParams = applyQualityBoost(params);
    const query = buildCodeSearchQuery(enhancedParams);

    if (!query.trim()) {
      return {
        error: 'Search query cannot be empty',
        type: 'http',
        status: 400,
      };
    }

    // Optimized search parameters with better defaults
    const searchParams: SearchCodeParameters = {
      q: query,
      per_page: Math.min(enhancedParams.limit || 30, 100),
      page: 1,
      // Always request text matches for better context
      headers: {
        Accept: 'application/vnd.github.v3.text-match+json',
      },
    };

    // Add sorting parameters for better relevance
    if (enhancedParams.sort && enhancedParams.sort !== 'best-match') {
      searchParams.sort = enhancedParams.sort;
    }
    if (enhancedParams.order) {
      searchParams.order = enhancedParams.order;
    }

    // Direct API call with optimized parameters
    const result = await octokit.rest.search.code(searchParams);

    const optimizedResult = await convertCodeSearchResult(
      result,
      enhancedParams.minify !== false,
      enhancedParams.sanitize !== false
    );

    return {
      data: {
        total_count: result.data.total_count,
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

/**
 * Convert Octokit code search result to our format with proper typing
 */
async function convertCodeSearchResult(
  octokitResult: SearchCodeResponse,
  minify: boolean = true,
  sanitize: boolean = true
): Promise<OptimizedCodeSearchResult> {
  const items: CodeSearchResultItem[] = octokitResult.data.items;

  return transformToOptimizedFormat(items, minify, sanitize);
}

/**
 * Transform GitHub API response to optimized format with enhanced metadata
 */
async function transformToOptimizedFormat(
  items: CodeSearchResultItem[],
  minify: boolean,
  sanitize: boolean
): Promise<OptimizedCodeSearchResult> {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  // Track security warnings and minification metadata
  const allSecurityWarningsSet = new Set<string>();
  let hasMinificationFailures = false;
  const minificationTypes: string[] = [];

  // Extract packages and dependencies from code matches
  const foundPackages = new Set<string>();
  const foundFiles = new Set<string>();

  const optimizedItems = await Promise.all(
    items.map(async item => {
      // Track found files for deeper research
      foundFiles.add(item.path);

      const processedMatches = await Promise.all(
        (item.text_matches || []).map(async match => {
          let processedFragment = match.fragment;

          // Apply sanitization first if enabled
          if (sanitize) {
            const sanitizationResult = ContentSanitizer.sanitizeContent(
              processedFragment || ''
            );
            processedFragment = sanitizationResult.content;

            // Collect security warnings
            if (sanitizationResult.hasSecrets) {
              allSecurityWarningsSet.add(
                `Secrets detected in ${item.path}: ${sanitizationResult.secretsDetected.join(', ')}`
              );
            }
            if (sanitizationResult.hasPromptInjection) {
              allSecurityWarningsSet.add(
                `Prompt injection detected in ${item.path}`
              );
            }
            if (sanitizationResult.isMalicious) {
              allSecurityWarningsSet.add(
                `Malicious content detected in ${item.path}`
              );
            }
            if (sanitizationResult.warnings.length > 0) {
              sanitizationResult.warnings.forEach(w =>
                allSecurityWarningsSet.add(`${item.path}: ${w}`)
              );
            }
          }

          // Apply minification if enabled
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
        },
        // Expose per-file minification strategy used for transparency
        ...(minify &&
          minificationTypes.length > 0 && {
            minificationType: Array.from(new Set(minificationTypes)).join(','),
          }),
      };
    })
  );

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
    // Add research context for smart hints
    _researchContext: {
      foundPackages: Array.from(foundPackages),
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

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.full_name,
      url: singleRepo.url,
    };
  }

  // Add processing metadata
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

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: CodeSearchResultItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0]?.repository;
  if (!firstRepo) return null;
  const allSameRepo = items.every(
    item => item.repository.full_name === firstRepo.full_name
  );

  return allSameRepo ? firstRepo : null;
}
