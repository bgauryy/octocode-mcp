import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import {
  GithubFetchRequestParams,
  GitHubFileContentResponse,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';
import { minifyContentV2 } from '../../utils/minifier';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { generateSmartHints } from './utils/toolRelationships';
import {
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  ToolOptions,
} from './utils/toolConstants';
import { fetchGitHubFileContentAPI } from '../../utils/githubAPI';

const DESCRIPTION = `Fetch file contents with smart context extraction.

Supports: Up to 10 files fetching with auto-fallback for branches

KEY WORKFLOW: 
  - Code Research: ${GITHUB_SEARCH_CODE_TOOL_NAME} results -> fetch file using  "matchString" ->  get context around matches
  - File Content: ${GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME} results  -> fetch relevant files to fetch by structure and file path

OPTIMIZATION: Use startLine/endLine for partial access, matchString for precise extraction with context lines
`;

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

// Cached function to get repository's default branch
async function getRepositoryDefaultBranch(
  owner: string,
  repo: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }

  try {
    const repoResult = await executeGitHubCommand(
      'api',
      [`/repos/${owner}/${repo}`],
      {
        cache: false,
      }
    );

    if (repoResult.isError) {
      return null;
    }

    const repoData = JSON.parse(repoResult.content[0].text as string);
    const execResult = repoData.result || repoData;
    const defaultBranch = execResult.default_branch || 'main';

    // Cache the successful result
    defaultBranchCache.set(cacheKey, defaultBranch);

    return defaultBranch;
  } catch (e) {
    return null;
  }
}

// Define the file content query schema
const FileContentQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
    .describe(
      `Repository owner/organization name (e.g., 'facebook', 'microsoft'). Do NOT include repository name here.`
    ),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .describe(
      `Repository name only (e.g., 'react', 'vscode'). Do NOT include owner/org prefix.`
    ),
  branch: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\s]+$/)
    .optional()
    .describe(
      `Branch name, tag name, OR commit SHA. If not provided, uses repository's default branch automatically. If provided branch fails, tries 'main' and 'master' as fallback.`
    ),
  filePath: z
    .string()
    .min(1)
    .describe(
      `File path from repository root (e.g., 'src/index.js', 'README.md', 'docs/api.md'). Do NOT start with slash.`
    ),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Starting line number (1-based) for partial file access. STRONGLY RECOMMENDED to save tokens instead of fetching full file content.`
    ),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Ending line number (1-based) for partial file access. Use with startLine to fetch only specific sections and save tokens.`
    ),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .default(5)
    .describe(`Context lines around target range. Default: 5.`),
  matchString: z
    .string()
    .optional()
    .describe(
      `Exact string to find in the file (from search results). Automatically locates this string and returns surrounding context with contextLines. Perfect for getting full context of search results.`
    ),
  minified: z
    .boolean()
    .default(true)
    .describe(
      `Optimize content for token efficiency (enabled by default). Applies basic formatting optimizations that may reduce token usage. Set to false only when exact formatting is required.`
    ),
  fallbackParams: z
    .object({
      branch: z.string().optional(),
      filePath: z.string().optional(),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      contextLines: z.number().int().min(0).max(50).optional(),
      matchString: z.string().optional(),
      minified: z.boolean().optional(),
    })
    .optional()
    .describe('Fallback parameters if original query returns no results'),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export interface FileContentQueryResult {
  queryId?: string;
  originalQuery: FileContentQuery;
  result: GitHubFileContentResponse | { error: string };
  apiResult?: GitHubFileContentResponse | { error: string };
  fallbackTriggered: boolean;
  fallbackQuery?: FileContentQuery;
  error?: string;
  apiError?: string;
}

export function registerFetchGitHubFileContentTool(
  server: McpServer,
  opts: ToolOptions = { githubAPIType: 'both', npmEnabled: false }
) {
  server.registerTool(
    GITHUB_GET_FILE_CONTENT_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(FileContentQuerySchema)
          .min(1)
          .max(10)
          .describe(
            'Array of up to 10 different file fetch queries for parallel execution'
          ),
      },
      annotations: {
        title: 'GitHub File Content - Bulk Queries Only (Optimized)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: {
        queries: FileContentQuery[];
      }): Promise<CallToolResult> => {
        try {
          return await fetchMultipleGitHubFileContents(args.queries, opts);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return createResult({
            isError: true,
            hints: [
              `Failed to fetch file content: ${errorMessage}. Verify repository access and file paths.`,
            ],
          });
        }
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[],
  opts: ToolOptions
): Promise<CallToolResult> {
  const results: FileContentQueryResult[] = [];

  // Execute all queries in parallel
  const queryPromises = queries.map(async (query, index) => {
    const queryId = query.id || `query_${index + 1}`;

    try {
      // Convert to original format
      const params: GithubFetchRequestParams = {
        owner: query.owner,
        repo: query.repo,
        branch: query.branch,
        filePath: query.filePath,
        startLine: query.startLine,
        endLine: query.endLine,
        contextLines: query.contextLines !== undefined ? query.contextLines : 5,
        matchString: query.matchString,
        minified: query.minified !== undefined ? query.minified : true,
      };

      // Execute fetches based on apiType option
      let cliResult: PromiseSettledResult<CallToolResult> | null = null;
      let apiResult: PromiseSettledResult<CallToolResult> | null = null;

      if (opts.githubAPIType === 'gh' || opts.githubAPIType === 'both') {
        // Execute CLI fetch
        cliResult = await Promise.allSettled([
          fetchGitHubFileContentCLI(params),
        ]).then(results => results[0]);
      }

      if (opts.githubAPIType === 'octokit' || opts.githubAPIType === 'both') {
        // Execute API fetch
        apiResult = await Promise.allSettled([
          fetchGitHubFileContentAPI(params, opts.ghToken),
        ]).then(results => results[0]);
      }

      let processedResult: GitHubFileContentResponse | { error: string } = {
        error: 'No results',
      };
      let error: string | undefined;
      let processedApiResult:
        | GitHubFileContentResponse
        | { error: string }
        | undefined;
      let apiError: string | undefined;

      // Process CLI result
      if (
        cliResult &&
        cliResult.status === 'fulfilled' &&
        !cliResult.value.isError
      ) {
        const data = JSON.parse(cliResult.value.content[0].text as string);
        processedResult = data.data || data;
      } else if (
        cliResult &&
        cliResult.status === 'fulfilled' &&
        cliResult.value.isError
      ) {
        error = cliResult.value.content[0].text as string;
      } else if (cliResult && cliResult.status === 'rejected') {
        error = `CLI fetch failed: ${cliResult.reason}`;
      }

      // Process API result
      if (
        apiResult &&
        apiResult.status === 'fulfilled' &&
        !apiResult.value.isError
      ) {
        const apiData = JSON.parse(apiResult.value.content[0].text as string);
        // The API result structure is different - it has a 'data' wrapper
        const apiResultData = apiData.data || apiData;
        processedApiResult = apiResultData;
      } else if (
        apiResult &&
        apiResult.status === 'fulfilled' &&
        apiResult.value.isError
      ) {
        apiError = apiResult.value.content[0].text as string;
      } else if (apiResult && apiResult.status === 'rejected') {
        apiError = `API fetch failed: ${apiResult.reason}`;
      }

      // Handle fallback logic if both primary methods failed
      if (error && apiError && query.fallbackParams) {
        const fallbackParams: GithubFetchRequestParams = {
          ...params,
          ...query.fallbackParams,
        };

        // Try fallback with CLI if it was the primary method
        if (opts.githubAPIType === 'gh' || opts.githubAPIType === 'both') {
          const fallbackResult =
            await fetchGitHubFileContentCLI(fallbackParams);
          if (!fallbackResult.isError) {
            const data = JSON.parse(fallbackResult.content[0].text as string);
            return {
              queryId,
              originalQuery: query,
              result: data.data || data,
              apiResult: processedApiResult,
              fallbackTriggered: true,
              fallbackQuery: { ...query, ...query.fallbackParams },
              error,
              apiError,
            };
          }
        }

        // Try fallback with API if it was the primary method
        if (opts.githubAPIType === 'octokit' || opts.githubAPIType === 'both') {
          const fallbackApiResult =
            await fetchGitHubFileContentAPI(fallbackParams);
          if (!fallbackApiResult.isError) {
            const apiData = JSON.parse(
              fallbackApiResult.content[0].text as string
            );
            const apiResultData = apiData.data || apiData;
            return {
              queryId,
              originalQuery: query,
              result: processedResult,
              apiResult: apiResultData,
              fallbackTriggered: true,
              fallbackQuery: { ...query, ...query.fallbackParams },
              error,
              apiError,
            };
          }
        }
      }

      // If we have an error but no successful result, update processedResult to include the error
      if (
        (error || apiError) &&
        'error' in processedResult &&
        processedResult.error === 'No results'
      ) {
        // Prioritize specific error messages over generic ones
        const specificError = error || apiError || 'No results';
        processedResult = { error: specificError };
      }

      return {
        queryId,
        originalQuery: query,
        result: processedResult,
        apiResult: processedApiResult,
        fallbackTriggered: false,
        error,
        apiError,
      };
    } catch (error) {
      // Handle any unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        queryId,
        originalQuery: query,
        result: { error: `Unexpected error: ${errorMessage}` },
        fallbackTriggered: false,
      };
    }
  });

  // Wait for all queries to complete
  const queryResults = await Promise.all(queryPromises);
  results.push(...queryResults);

  // Calculate summary statistics
  const totalQueries = results.length;
  const successfulQueries = results.filter(
    r => !('error' in r.result) && !r.error
  ).length;
  const successfulApiQueries = results.filter(
    r => r.apiResult && !('error' in r.apiResult) && !r.apiError
  ).length;
  const queriesWithFallback = results.filter(r => r.fallbackTriggered).length;

  const hints = generateSmartHints(GITHUB_GET_FILE_CONTENT_TOOL_NAME, {
    hasResults: successfulQueries > 0 || successfulApiQueries > 0,
    totalItems: successfulQueries + successfulApiQueries,
    errorMessage:
      successfulQueries === 0 && successfulApiQueries === 0
        ? 'All file fetches failed'
        : undefined,
  });

  // Extract API results for separate section
  const apiResults = results.map(result => ({
    queryId: result.queryId,
    data: result.apiResult || { error: 'No API result' },
    error: result.apiError,
  }));

  return createResult({
    data: {
      results,
      apiResults,
      summary: {
        totalQueries,
        successfulQueries,
        failedQueries: totalQueries - successfulQueries,
        cli: {
          successfulQueries,
          failedQueries: totalQueries - successfulQueries,
        },
        api: {
          successfulQueries: successfulApiQueries,
          failedQueries: totalQueries - successfulApiQueries,
        },
        queriesWithFallback,
      },
    },
    hints,
  });
}

export async function fetchGitHubFileContentCLI(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, filePath } = params;
    let { branch } = params;

    try {
      // If no branch provided, get the default branch
      if (!branch) {
        const defaultBranch = await getRepositoryDefaultBranch(owner, repo);

        if (!defaultBranch) {
          return createResult({
            isError: true,
            hints: [`Repository ${owner}/${repo} not found or not accessible`],
          });
        }

        branch = defaultBranch;
      }

      // Try to fetch file content directly
      const isCommitSha = branch!.match(/^[0-9a-f]{40}$/);
      const apiPath = isCommitSha
        ? `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}` // Use contents API with ref for commit SHA
        : `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`; // Use contents API for branches/tags

      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Efficient fallback: try common branches directly on 404
        if (errorMsg.includes('404')) {
          const commonBranches = ['main', 'master'];
          const triedBranches = [branch];

          // Try common branches directly without additional repo info calls
          for (const tryBranch of commonBranches) {
            if (triedBranches.includes(tryBranch)) continue;

            const tryBranchPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${tryBranch}`;
            const tryBranchResult = await executeGitHubCommand(
              'api',
              [tryBranchPath],
              {
                cache: false,
              }
            );

            if (!tryBranchResult.isError) {
              return await processFileContent(
                tryBranchResult,
                owner,
                repo,
                tryBranch,
                filePath,
                params.minified,
                params.startLine,
                params.endLine,
                params.contextLines,
                params.matchString
              );
            }
          }
        }

        // Return original error if all fallbacks failed
        return result;
      }

      return await processFileContent(
        result,
        owner,
        repo,
        branch!,
        filePath,
        params.minified,
        params.startLine,
        params.endLine,
        params.contextLines,
        params.matchString
      );
    } catch (error) {
      return createResult({
        error: `Error fetching file content: ${error}`,
      });
    }
  });
}

async function processFileContent(
  result: CallToolResult,
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
  // Extract the actual content from the exec result
  const execResult = JSON.parse(result.content[0].text as string);
  const fileData = execResult.result;
  // Check if it's a directory
  if (Array.isArray(fileData)) {
    return createResult({
      isError: true,
      hints: [
        'Path is a directory. Use github_view_repo_structure to list directory contents',
      ],
    });
  }

  const fileSize = typeof fileData.size === 'number' ? fileData.size : 0;
  const MAX_FILE_SIZE = 300 * 1024; // 300KB limit for better performance and reliability

  // Check file size with helpful message
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

  // Get and decode content with validation
  if (!fileData.content) {
    return createResult({
      isError: true,
      hints: ['File is empty - no content to display'],
    });
  }

  const base64Content = fileData.content.replace(/\s/g, ''); // Remove all whitespace

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

  // 🔥 SMART MATCH FINDER: If matchString is provided, find it and set line range
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

  const hints = generateSmartHints(GITHUB_GET_FILE_CONTENT_TOOL_NAME, {
    hasResults: true,
    totalItems: 1,
    customHints: securityWarnings.length > 0 ? securityWarnings : undefined,
  });

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
    hints,
  });
}

/**
 * Wrapper function that supports both CLI and API fetching based on options
 */
export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams,
  opts: ToolOptions = { githubAPIType: 'both', npmEnabled: false }
): Promise<CallToolResult> {
  // For backward compatibility, if no options provided, use CLI
  if (opts.githubAPIType === 'gh') {
    return fetchGitHubFileContentCLI(params);
  } else if (opts.githubAPIType === 'octokit') {
    return fetchGitHubFileContentAPI(params, opts.ghToken);
  } else {
    // For 'both', try CLI first, then API as fallback
    const cliResult = await fetchGitHubFileContentCLI(params);
    if (!cliResult.isError) {
      return cliResult;
    }

    // Try API as fallback
    const apiResult = await fetchGitHubFileContentAPI(params, opts.ghToken);
    return apiResult;
  }
}
