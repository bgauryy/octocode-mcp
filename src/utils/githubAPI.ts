import { Octokit, RequestError } from 'octokit';
import type { OctokitOptions } from '@octokit/core';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../mcp/responses';
import { generateCacheKey, withCache } from './cache';
import {
  GitHubReposSearchParams,
  GitHubCodeSearchItem,
  OptimizedCodeSearchResult,
  GithubFetchRequestParams,
  GitHubFileContentResponse,
} from '../types';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContentV2 } from './minifier';
import { optimizeTextMatch } from '../mcp/responses';

// TypeScript-safe conditional authentication
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// TypeScript-safe parameter types using Octokit's built-in types
type SearchCodeParameters =
  RestEndpointMethodTypes['search']['code']['parameters'];
type SearchReposParameters =
  RestEndpointMethodTypes['search']['repos']['parameters'];
type SearchCodeResponse = RestEndpointMethodTypes['search']['code']['response'];
type GetContentParameters =
  RestEndpointMethodTypes['repos']['getContent']['parameters'];

// Define TextMatch type based on GitHub API response structure
interface TextMatch {
  fragment: string;
  matches?: Array<{
    text: string;
    indices: [number, number];
  }>;
}

// Use the same type as the existing github_search_code.ts implementation
export interface GitHubCodeSearchQuery {
  id?: string;
  queryTerms?: string[];
  language?: string;
  owner?: string | string[];
  repo?: string | string[];
  filename?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path' | ('file' | 'path')[];
  size?: string;
  limit?: number;
  visibility?: 'public' | 'private' | 'internal';
  minify?: boolean;
  sanitize?: boolean;
}

// Enhanced error response type
interface GitHubAPIError {
  error: string;
  status?: number;
  retryAfter?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

// Initialize Octokit instance with proper TypeScript configuration
let octokit: Octokit | null = null;

/**
 * Initialize Octokit with TypeScript-safe authentication and built-in plugins
 */
function getOctokit(): Octokit {
  if (!octokit) {
    // TypeScript-safe configuration
    const options: OctokitOptions = {
      userAgent: 'octocode-mcp/1.0.0',
      request: {
        timeout: 30000, // 30 second timeout
      },
      // Built-in throttling configuration
      throttle: {
        onRateLimit: (retryAfter: number) => {
          // Use proper logging instead of console
          // eslint-disable-next-line no-console
          console.warn(
            `GitHub API rate limit hit. Retrying after ${retryAfter}s`
          );
          return true; // Auto-retry
        },
        onSecondaryRateLimit: (retryAfter: number) => {
          // Use proper logging instead of console
          // eslint-disable-next-line no-console
          console.warn(
            `GitHub API secondary rate limit. Retrying after ${retryAfter}s`
          );
          return true; // Auto-retry
        },
      },
      // Built-in retry configuration with exponential backoff
      retry: {
        doNotRetry: ['400', '401', '403', '404', '422'],
      },
    };
    if (token) {
      options.auth = token;
    }

    octokit = new Octokit(options);
  }
  return octokit;
}

/**
 * Build search query string for GitHub API from parameters
 */
function buildCodeSearchQuery(params: GitHubCodeSearchQuery): string {
  const queryParts: string[] = [];

  // Add main search terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  // Add filters as qualifiers
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  if (params.owner && params.repo) {
    const owner = Array.isArray(params.owner) ? params.owner[0] : params.owner;
    const repo = Array.isArray(params.repo) ? params.repo[0] : params.repo;
    queryParts.push(`repo:${owner}/${repo}`);
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => queryParts.push(`user:${owner}`));
  }

  if (params.filename) {
    queryParts.push(`filename:${params.filename}`);
  }

  if (params.extension) {
    queryParts.push(`extension:${params.extension}`);
  }

  if (params.path) {
    queryParts.push(`path:${params.path}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'file') {
        queryParts.push('in:file');
      } else if (match === 'path') {
        queryParts.push('in:path');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Build search query string for repository search
 */
function buildRepoSearchQuery(params: GitHubReposSearchParams): string {
  const queryParts: string[] = [];

  // Add main search terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  if (params.exactQuery) {
    queryParts.push(`"${params.exactQuery}"`);
  }

  // Add filters as qualifiers
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => queryParts.push(`user:${owner}`));
  }

  if (params.topic) {
    const topics = Array.isArray(params.topic) ? params.topic : [params.topic];
    topics.forEach(topic => queryParts.push(`topic:${topic}`));
  }

  if (params.stars) {
    queryParts.push(`stars:${params.stars}`);
  }

  if (params.forks) {
    queryParts.push(`forks:${params.forks}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }

  if (params.updated) {
    queryParts.push(`pushed:${params.updated}`);
  }

  if (params.archived !== undefined) {
    queryParts.push(`archived:${params.archived}`);
  }

  if (params['include-forks']) {
    if (params['include-forks'] === 'only') {
      queryParts.push('fork:only');
    } else if (params['include-forks'] === 'true') {
      queryParts.push('fork:true');
    } else {
      queryParts.push('fork:false');
    }
  }

  if (params.license) {
    const licenses = Array.isArray(params.license)
      ? params.license
      : [params.license];
    licenses.forEach(license => queryParts.push(`license:${license}`));
  }

  if (params['good-first-issues']) {
    queryParts.push(`good-first-issues:${params['good-first-issues']}`);
  }

  if (params['help-wanted-issues']) {
    queryParts.push(`help-wanted-issues:${params['help-wanted-issues']}`);
  }

  if (params.followers) {
    queryParts.push(`followers:${params.followers}`);
  }

  if (params['number-topics']) {
    queryParts.push(`topics:${params['number-topics']}`);
  }

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'name') {
        queryParts.push('in:name');
      } else if (match === 'description') {
        queryParts.push('in:description');
      } else if (match === 'readme') {
        queryParts.push('in:readme');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Enhanced error handling using RequestError with proper typing
 */
function handleGitHubAPIError(error: unknown): GitHubAPIError {
  if (error instanceof RequestError) {
    const { status, message, response } = error;

    switch (status) {
      case 401:
        return {
          error: 'Authentication required',
          status,
        };
      case 403: {
        const remaining = response?.headers?.['x-ratelimit-remaining'];
        const reset = response?.headers?.['x-ratelimit-reset'];

        if (remaining === '0') {
          const resetTime = reset ? new Date(parseInt(reset) * 1000) : null;
          return {
            error: 'Rate limit exceeded',
            status,
            rateLimitRemaining: 0,
            rateLimitReset: resetTime ? resetTime.getTime() : undefined,
            retryAfter: resetTime
              ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
              : 3600,
          };
        }
        return {
          error: 'Access forbidden - check repository permissions',
          status,
        };
      }
      case 422:
        return {
          error: 'Invalid search query',
          status,
        };
      case 404:
        return {
          error: 'Repository or resource not found',
          status,
        };
      default:
        return {
          error: message || 'GitHub API request failed',
          status,
        };
    }
  }

  return {
    error: error instanceof Error ? error.message : 'Unknown error occurred',
  };
}

/**
 * Convert Octokit code search result to our format with proper typing
 */
async function convertCodeSearchResult(
  octokitResult: SearchCodeResponse,
  minify: boolean = true,
  sanitize: boolean = true
): Promise<OptimizedCodeSearchResult> {
  const items: GitHubCodeSearchItem[] = octokitResult.data.items.map(
    (item: any) => ({
      path: item.path,
      repository: {
        id: item.repository.id.toString(),
        nameWithOwner: item.repository.full_name,
        url: item.repository.html_url,
        isFork: item.repository.fork,
        isPrivate: item.repository.private,
      },
      sha: item.sha,
      url: item.html_url,
      textMatches:
        item.text_matches?.map((match: TextMatch) => ({
          fragment: match.fragment,
          matches:
            match.matches?.map((m: any) => ({
              text: m.text,
              indices: m.indices as [number, number],
            })) || [],
        })) || [],
    })
  );

  return transformToOptimizedFormat(items, minify, sanitize);
}

/**
 * Transform GitHub API response to optimized format with enhanced metadata
 */
async function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[],
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
        (item.textMatches || []).map(async match => {
          let processedFragment = match.fragment;

          // Apply sanitization first if enabled
          if (sanitize) {
            const sanitizationResult =
              ContentSanitizer.sanitizeContent(processedFragment);
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
            const minifyResult = await minifyContentV2(
              processedFragment,
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
            context: optimizeTextMatch(processedFragment, 120),
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
          nameWithOwner: item.repository.nameWithOwner,
          url: item.repository.url,
        },
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
        ? {
            owner: singleRepo.nameWithOwner.split('/')[0],
            repo: singleRepo.nameWithOwner.split('/')[1],
          }
        : undefined,
    },
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
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
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Search GitHub code using Octokit API with proper TypeScript types
 */
export async function searchGitHubCodeAPI(
  params: GitHubCodeSearchQuery
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-api-code', params);

  return withCache(cacheKey, async () => {
    try {
      const octokit = getOctokit();
      const query = buildCodeSearchQuery(params);

      if (!query.trim()) {
        return createResult({
          isError: true,
          hints: ['Search query cannot be empty. Provide queryTerms.'],
        });
      }

      // Use properly typed parameters
      const searchParams: SearchCodeParameters = {
        q: query,
        per_page: Math.min(params.limit || 30, 100),
        page: 1,
      };

      // GitHub API code search supports 'indexed' sort and 'asc'/'desc' order
      // But these are not commonly used, so we'll skip them for now

      const result = await octokit.rest.search.code(searchParams);
      const optimizedResult = await convertCodeSearchResult(
        result,
        params.minify !== false,
        params.sanitize !== false
      );

      return createResult({
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
      });
    } catch (error: unknown) {
      const apiError = handleGitHubAPIError(error);
      const hints: string[] = [];

      switch (apiError.status) {
        case 403:
          if (apiError.rateLimitRemaining === 0) {
            hints.push(
              `GitHub API rate limit exceeded. Retry after ${apiError.retryAfter} seconds.`,
              'Set GITHUB_TOKEN environment variable for higher rate limits (5000/hour vs 60/hour).'
            );
          } else {
            hints.push(
              'Access forbidden. Check repository permissions or authentication.',
              'Set GITHUB_TOKEN environment variable for private repository access.'
            );
          }
          break;
        case 401:
          hints.push(
            'GitHub authentication required for code search.',
            'Set GITHUB_TOKEN or GH_TOKEN environment variable.'
          );
          break;
        case 422:
          hints.push(
            'Search query validation failed. Check search terms and filters.',
            'Ensure search query follows GitHub search syntax.'
          );
          break;
        default:
          hints.push(apiError.error);
      }

      return createResult({
        isError: true,
        hints,
      });
    }
  });
}

/**
 * Search GitHub repositories using Octokit API with proper TypeScript types
 */
export async function searchGitHubReposAPI(
  params: GitHubReposSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-api-repos', params);

  return withCache(cacheKey, async () => {
    try {
      const octokit = getOctokit();
      const query = buildRepoSearchQuery(params);

      if (!query.trim()) {
        return createResult({
          isError: true,
          hints: [
            'Search query cannot be empty. Provide queryTerms, exactQuery, or filters.',
          ],
        });
      }

      // Use properly typed parameters
      const searchParams: SearchReposParameters = {
        q: query,
        per_page: Math.min(params.limit || 30, 100),
        page: 1,
      };

      // Add sort and order if specified
      if (params.sort && params.sort !== 'best-match') {
        searchParams.sort = params.sort as SearchReposParameters['sort'];
      }
      if (params.order) {
        searchParams.order = params.order as SearchReposParameters['order'];
      }

      const result = await octokit.rest.search.repos(searchParams);

      // Transform repository results to match CLI format with proper typing
      const repositories = result.data.items.map((repo: any) => ({
        name: repo.full_name,
        stars: repo.stargazers_count || 0,
        description: repo.description
          ? repo.description.length > 150
            ? repo.description.substring(0, 150) + '...'
            : repo.description
          : 'No description',
        language: repo.language || 'Unknown',
        url: repo.html_url,
        forks: repo.forks_count || 0,
        updatedAt: new Date(repo.updated_at).toLocaleDateString('en-GB'),
        owner: repo.owner.login,
      }));

      return createResult({
        data: {
          total_count: result.data.total_count,
          repositories,
        },
      });
    } catch (error: unknown) {
      const apiError = handleGitHubAPIError(error);
      const hints: string[] = [];

      switch (apiError.status) {
        case 403:
          if (apiError.rateLimitRemaining === 0) {
            hints.push(
              `GitHub API rate limit exceeded. Retry after ${apiError.retryAfter} seconds.`,
              'Set GITHUB_TOKEN environment variable for higher rate limits.'
            );
          } else {
            hints.push(
              'Access forbidden. Check authentication or repository permissions.'
            );
          }
          break;
        case 422:
          hints.push(
            'Search query validation failed. Check search terms and filters.',
            'Ensure search query follows GitHub search syntax.'
          );
          break;
        default:
          hints.push(apiError.error);
      }

      return createResult({
        isError: true,
        hints,
      });
    }
  });
}

/**
 * Fetch GitHub file content using Octokit API with proper TypeScript types
 */
export async function fetchGitHubFileContentAPI(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-api-file-content', params);

  return withCache(cacheKey, async () => {
    try {
      const octokit = getOctokit();
      const { owner, repo, filePath, branch } = params;

      // Use properly typed parameters
      const contentParams: GetContentParameters = {
        owner,
        repo,
        path: filePath,
        ...(branch && { ref: branch }),
      };

      const result = await octokit.rest.repos.getContent(contentParams);

      // Handle the response data
      const data = result.data;

      // Check if it's a directory (array response)
      if (Array.isArray(data)) {
        return createResult({
          isError: true,
          hints: [
            'Path is a directory. Use githubViewRepoStructure to list directory contents',
          ],
        });
      }

      // Check if it's a file with content
      if ('content' in data && data.type === 'file') {
        const fileSize = data.size || 0;
        const MAX_FILE_SIZE = 300 * 1024; // 300KB limit

        // Check file size
        if (fileSize > MAX_FILE_SIZE) {
          const fileSizeKB = Math.round(fileSize / 1024);
          const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

          return createResult({
            isError: true,
            hints: [
              `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
            ],
          });
        }

        // Get and decode content
        if (!data.content) {
          return createResult({
            isError: true,
            hints: ['File is empty - no content to display'],
          });
        }

        const base64Content = data.content.replace(/\s/g, ''); // Remove all whitespace

        if (!base64Content) {
          return createResult({
            isError: true,
            hints: ['File is empty - no content to display'],
          });
        }

        let decodedContent: string;
        try {
          const buffer = Buffer.from(base64Content, 'base64');

          // Simple binary check - look for null bytes
          if (buffer.indexOf(0) !== -1) {
            return createResult({
              isError: true,
              hints: [
                'Binary file detected. Cannot display as text - download directly from GitHub',
              ],
            });
          }

          decodedContent = buffer.toString('utf-8');
        } catch (decodeError) {
          return createResult({
            isError: true,
            hints: [
              'Failed to decode file. Encoding may not be supported (expected UTF-8)',
            ],
          });
        }

        // Process the content similar to CLI implementation
        return await processFileContentAPI(
          decodedContent,
          owner,
          repo,
          branch || data.sha,
          filePath,
          params.minified !== false,
          params.startLine,
          params.endLine,
          params.contextLines || 5,
          params.matchString
        );
      }

      // Handle other file types (symlinks, submodules, etc.)
      return createResult({
        isError: true,
        hints: [`Unsupported file type: ${data.type}`],
      });
    } catch (error: unknown) {
      const apiError = handleGitHubAPIError(error);
      const hints: string[] = [];

      switch (apiError.status) {
        case 403:
          if (apiError.rateLimitRemaining === 0) {
            hints.push(
              `GitHub API rate limit exceeded. Retry after ${apiError.retryAfter} seconds.`,
              'Set GITHUB_TOKEN environment variable for higher rate limits.'
            );
          } else {
            hints.push(
              'Access forbidden. Check repository permissions or authentication.',
              'Set GITHUB_TOKEN environment variable for private repository access.'
            );
          }
          break;
        case 401:
          hints.push(
            'GitHub authentication required for file access.',
            'Set GITHUB_TOKEN or GH_TOKEN environment variable.'
          );
          break;
        case 404:
          hints.push(
            'File, repository, or branch not found.',
            'Verify the file path, repository name, and branch exist.'
          );
          break;
        default:
          hints.push(apiError.error);
      }

      return createResult({
        isError: true,
        hints,
      });
    }
  });
}

/**
 * Process file content from API with similar functionality to CLI implementation
 */
async function processFileContentAPI(
  decodedContent: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  minified: boolean,
  startLine?: number,
  endLine?: number,
  contextLines: number = 5,
  matchString?: string
): Promise<CallToolResult> {
  // Sanitize the decoded content for security
  const sanitizationResult = ContentSanitizer.sanitizeContent(decodedContent);
  decodedContent = sanitizationResult.content;

  // Add security warnings to the response if any issues were found
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

  // Handle partial file access
  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;
  let hasLineAnnotations = false;

  // Always calculate total lines for metadata
  const lines = decodedContent.split('\n');
  const totalLines = lines.length;

  // SMART MATCH FINDER: If matchString is provided, find it and set line range
  if (matchString) {
    const matchingLines: number[] = [];

    // Find all lines that contain the match string
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(matchString)) {
        matchingLines.push(i + 1); // Convert to 1-based line numbers
      }
    }

    if (matchingLines.length === 0) {
      return createResult({
        isError: true,
        hints: [
          `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
        ],
      });
    }

    // Use the first match, with context lines around it
    const firstMatch = matchingLines[0];
    const matchStartLine = Math.max(1, firstMatch - contextLines);
    const matchEndLine = Math.min(totalLines, firstMatch + contextLines);

    // Override any manually provided startLine/endLine when matchString is used
    startLine = matchStartLine;
    endLine = matchEndLine;

    // Add info about the match for user context
    securityWarnings.push(
      `Found "${matchString}" on line ${firstMatch}${matchingLines.length > 1 ? ` (and ${matchingLines.length - 1} other locations)` : ''}`
    );
  }

  if (startLine !== undefined) {
    // Validate line numbers
    if (startLine < 1 || startLine > totalLines) {
      return createResult({
        isError: true,
        hints: [
          `Invalid startLine ${startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
        ],
      });
    }

    // Calculate actual range with context
    const contextStart = Math.max(1, startLine - contextLines);
    let adjustedEndLine = endLine;

    // Validate and auto-adjust endLine if provided
    if (endLine !== undefined) {
      if (endLine < startLine) {
        return createResult({
          isError: true,
          hints: [
            `Invalid range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
          ],
        });
      }

      // Auto-adjust endLine to file boundaries with helpful message
      if (endLine > totalLines) {
        adjustedEndLine = totalLines;
        securityWarnings.push(
          `Requested endLine ${endLine} adjusted to ${totalLines} (file end)`
        );
      }
    }

    const contextEnd = adjustedEndLine
      ? Math.min(totalLines, adjustedEndLine + contextLines)
      : Math.min(totalLines, startLine + contextLines);

    // Extract the specified range with context from ORIGINAL content
    const selectedLines = lines.slice(contextStart - 1, contextEnd);

    actualStartLine = contextStart;
    actualEndLine = contextEnd;
    isPartial = true;

    // Add line number annotations for partial content
    const annotatedLines = selectedLines.map((line, index) => {
      const lineNumber = contextStart + index;
      const isInTargetRange =
        lineNumber >= startLine &&
        (adjustedEndLine === undefined || lineNumber <= adjustedEndLine);
      const marker = isInTargetRange ? '→' : ' ';
      return `${marker}${lineNumber.toString().padStart(4)}: ${line}`;
    });

    finalContent = annotatedLines.join('\n');
    hasLineAnnotations = true;
  }

  // Apply minification to final content (both partial and full files)
  let minificationFailed = false;
  let minificationType = 'none';

  if (minified) {
    if (hasLineAnnotations) {
      // For partial content with line annotations, extract code content first
      const annotatedLines = finalContent.split('\n');
      const codeLines = annotatedLines.map(line => {
        // Remove line number annotations but preserve the original line content
        const match = line.match(/^[→ ]\s*\d+:\s*(.*)$/);
        return match ? match[1] : line;
      });

      const codeContent = codeLines.join('\n');
      const minifyResult = await minifyContentV2(codeContent, filePath);

      if (!minifyResult.failed) {
        // Apply minification first, then add simple line annotations
        // Since minified content may be much shorter, use a simplified annotation approach
        finalContent = `Lines ${actualStartLine}-${actualEndLine} (minified):\n${minifyResult.content}`;
        minificationType = minifyResult.type;
      } else {
        minificationFailed = true;
      }
    } else {
      // Full file minification
      const minifyResult = await minifyContentV2(finalContent, filePath);
      finalContent = minifyResult.content;
      minificationFailed = minifyResult.failed;
      minificationType = minifyResult.type;
    }
  }

  return createResult({
    data: {
      filePath,
      owner,
      repo,
      branch,
      content: finalContent,
      // Always return total lines for LLM context
      totalLines,
      // Original request parameters for LLM context
      requestedStartLine: startLine,
      requestedEndLine: endLine,
      requestedContextLines: contextLines,
      // Actual content boundaries (only for partial content)
      ...(isPartial && {
        startLine: actualStartLine,
        endLine: actualEndLine,
        isPartial,
      }),
      // Minification metadata
      ...(minified && {
        minified: !minificationFailed,
        minificationFailed: minificationFailed,
        minificationType: minificationType,
      }),
      // Security metadata
      ...(securityWarnings.length > 0 && {
        securityWarnings,
      }),
    } as GitHubFileContentResponse,
  });
}

/**
 * Check GitHub API authentication status with proper typing
 */
export async function checkGitHubAuthAPI(): Promise<CallToolResult> {
  try {
    const octokit = getOctokit();
    const result = await octokit.rest.users.getAuthenticated();

    return createResult({
      data: {
        authenticated: true,
        user: result.data.login,
        name: result.data.name,
        type: result.data.type,
        rateLimit: {
          remaining: result.headers['x-ratelimit-remaining'],
          limit: result.headers['x-ratelimit-limit'],
          reset: result.headers['x-ratelimit-reset'],
        },
      },
    });
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);

    if (apiError.status === 401) {
      return createResult({
        data: {
          authenticated: false,
          message: 'No valid authentication found',
          hint: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        },
      });
    }

    return createResult({
      isError: true,
      hints: [`Authentication check failed: ${apiError.error}`],
    });
  }
}
