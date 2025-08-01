import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses';
import { generateCacheKey, withCache } from '../../utils/cache';
import {
  fetchGitHubFileContentAPI,
  getDefaultBranch,
  generateFileAccessHints,
} from '../../utils/githubAPI';
import { executeGitHubCommand } from '../../utils/exec';
import type { GithubFetchRequestParams } from '../../types';
import { minifyContentV2 } from '../../utils/minifier';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { generateSmartHints } from './utils/toolRelationships';
import { processDualResults } from './utils/resultProcessor';
import { GITHUB_GET_FILE_CONTENT_TOOL_NAME } from './utils/toolConstants';

const DESCRIPTION = `
Fetch file contents with smart context extraction.

Supports: Up to 10 files fetching with auto-fallback for branches

KEY WORKFLOW: 
  - Code Research: githubSearchCode results -> fetch file using  "matchString" ->  get context around matches
  - File Content: githubViewRepoStructure results  -> fetch relevant files to fetch by structure and file path

OPTIMIZATION: Use startLine/endLine for partial access, matchString for precise extraction with context lines
`;

// Remove the old getRepositoryDefaultBranch function and defaultBranchCache
// These are now handled by the shared utilities in githubAPI.ts

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
  filePath: z
    .string()
    .min(1)
    .describe(
      `File path from repository root (e.g., 'src/index.js', 'README.md', 'docs/api.md'). Do NOT start with slash.`
    ),
  branch: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\s]+$/)
    .optional()
    .describe(
      `Branch name, tag name, OR commit SHA. If not provided, uses repository's default branch automatically. If provided branch fails, smart hints will suggest alternatives.`
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
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export interface FileContentQueryResult {
  queryId?: string;
  originalQuery: FileContentQuery;
  result: any;
  apiResult?: any;
  fallbackTriggered: boolean;
  error?: string;
  apiError?: string;
}

export function registerFetchGitHubFileContentTool(
  server: any, // McpServer is removed, so use 'any' for now
  opts: any = { githubAPIType: 'both', npmEnabled: false } // Make optional with default
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
    async (args: { queries: FileContentQuery[] }): Promise<CallToolResult> => {
      if (!Array.isArray(args.queries) || args.queries.length === 0) {
        return createResult({
          data: {
            results: [],
            summary: {
              totalQueries: 0,
              successfulQueries: 0,
              successful_api: 0,
              failed: 0,
            },
          },
          hints: ['No queries provided'],
        });
      }

      return fetchMultipleGitHubFileContents(args.queries, opts);
    }
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[],
  opts: any
): Promise<CallToolResult> {
  const results: FileContentQueryResult[] = [];

  // Execute all queries in parallel
  const queryPromises = queries.map(async (query, index) => {
    const queryId = query.id || `query_${index + 1}`;
    const params: GithubFetchRequestParams = {
      owner: query.owner,
      repo: query.repo,
      filePath: query.filePath,
      branch: query.branch,
      startLine: query.startLine,
      endLine: query.endLine,
      contextLines: query.contextLines,
      matchString: query.matchString,
      minified: query.minified,
    };

    try {
      // Try CLI and/or API based on options
      const promises: Promise<any>[] = [];

      if (opts.githubAPIType === 'gh' || opts.githubAPIType === 'both') {
        promises.push(fetchGitHubFileContentCLI(params));
      }

      if (opts.githubAPIType === 'octokit' || opts.githubAPIType === 'both') {
        promises.push(fetchGitHubFileContentAPI(params, opts.ghToken));
      }

      const results = await Promise.allSettled(promises);
      const [cliResult, apiResult] = results;

      // Create custom data extractor for file content
      const fileContentExtractor = (data: any) => {
        // Handle the special file content structure with fallback
        return data.data || data;
      };

      // Use standardized dual result processing
      const dualResult = await processDualResults(cliResult, apiResult, {
        cliDataExtractor: fileContentExtractor,
        apiDataExtractor: fileContentExtractor,
        preferredSource: 'cli',
      });

      const processedResult = dualResult.cli.data;
      const error = dualResult.cli.error;
      const processedApiResult = dualResult.api.data;
      const apiError = dualResult.api.error;

      // Check if we have any successful results
      const hasSuccessfulResult =
        processedResult &&
        typeof processedResult === 'object' &&
        !('error' in processedResult);
      const hasSuccessfulApiResult =
        processedApiResult &&
        typeof processedApiResult === 'object' &&
        !('error' in processedApiResult);

      // If both methods failed or no successful results, generate smart hints
      if (
        (error || apiError) &&
        !hasSuccessfulResult &&
        !hasSuccessfulApiResult
      ) {
        // Get default branch for better hints
        const defaultBranch = await getDefaultBranch(
          query.owner,
          query.repo,
          opts.ghToken
        );
        const hints = generateFileAccessHints(
          query.owner,
          query.repo,
          query.filePath,
          query.branch || 'main',
          defaultBranch,
          error || apiError
        );

        return {
          queryId,
          originalQuery: query,
          result: { error: error || apiError, hints },
          apiResult: processedApiResult,
          fallbackTriggered: false,
          error,
          apiError,
        };
      }

      // Use successful result - prefer CLI result, fall back to API result
      let finalResult = processedResult;
      if (!hasSuccessfulResult && hasSuccessfulApiResult) {
        finalResult = processedApiResult;
      }

      // If we still don't have a result, return error
      if (!finalResult) {
        const errorMsg = error || apiError || 'No results available';
        return {
          queryId,
          originalQuery: query,
          result: { error: errorMsg },
          apiResult: processedApiResult,
          fallbackTriggered: false,
          error,
          apiError,
        };
      }

      return {
        queryId,
        originalQuery: query,
        result: finalResult,
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

  // Generate comprehensive hints
  const hints = generateSmartHints(GITHUB_GET_FILE_CONTENT_TOOL_NAME, {
    hasResults: successfulQueries > 0,
    totalItems: successfulQueries,
    customHints: results
      .filter(r => r.result?.hints)
      .flatMap(r => r.result.hints)
      .slice(0, 5), // Limit to 5 most relevant hints
  });

  return createResult({
    data: {
      results: results, // Change back to "results" for backward compatibility
      summary: {
        totalQueries: totalQueries,
        successfulQueries: successfulQueries,
        successful_api: successfulApiQueries,
        failed: totalQueries - successfulQueries,
      },
    },
    hints,
  });
}

export async function fetchGitHubFileContentCLI(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content-cli', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, filePath } = params;
    let { branch } = params;

    // Use default branch if not specified
    if (!branch) {
      const defaultBranch = await getDefaultBranch(owner, repo);
      branch = defaultBranch || 'main';
    }

    try {
      const apiPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Return raw error result for main function to process
        // Don't use createResult here - return the raw CallToolResult with error
        return {
          content: [{ type: 'text', text: errorMsg }],
          isError: true,
        };
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
        isError: true,
        hints: [`Error fetching file content: ${error}`],
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
    },
    hints,
  });
}
