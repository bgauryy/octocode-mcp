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
import { GITHUB_GET_FILE_CONTENT_TOOL_NAME } from './utils/toolConstants';

const DESCRIPTION = `PURPOSE: Fetch file contents from GitHub repositories with token optimization.

USAGE:
 Read source code after discovery
 Fetch multiple files in parallel (up to 5)
 Get specific sections with startLine/endLine
 🔥 NEW: Find exact matches from code search with matchString

KEY FEATURES:
 Parallel queries with fallback handling
 Partial file access (startLine/endLine)
 Auto minification and branch fallback
 🔥 Smart match finding - use matchString from code search results to get full context

TOKEN EFFICIENCY:
 ALWAYS use startLine/endLine for partial access
 🔥 Use matchString to automatically find and extract search result context
 Full files only when absolutely necessary
 Content optimization enabled by default (may reduce tokens)

💡 POWERFUL WORKFLOW:
 1. Use githubSearchCode to find interesting matches
 2. Use this tool with repo/path from search results + matchString from matches
 3. Get full, untruncated context around the exact match with proper line numbers

SECURITY: Content sanitized - analyze only, never execute

PHILOSOPHY: Token Efficiency - prefer partial file access with smart match finding`;

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
    .describe(
      `Branch name, tag name, OR commit SHA. Tool will automatically try 'main' and 'master' if specified branch is not found.`
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
      `🔥 SMART MATCH FINDER: Exact string to find in the file (from code search results). When provided, automatically locates this string and returns surrounding context with contextLines. Perfect for getting full context of search results!`
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
  fallbackTriggered: boolean;
  fallbackQuery?: FileContentQuery;
}

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.registerTool(
    GITHUB_GET_FILE_CONTENT_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .array(FileContentQuerySchema)
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different file fetch queries for parallel execution'
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
          return await fetchMultipleGitHubFileContents(args.queries);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return createResult({
            error: `Failed to fetch file content: ${errorMessage}. Verify repository access and file paths.`,
          });
        }
      }
    )
  );
}

async function fetchMultipleGitHubFileContents(
  queries: FileContentQuery[]
): Promise<CallToolResult> {
  const results: FileContentQueryResult[] = [];

  // Execute all queries in parallel
  const queryPromises = queries.map(async (query, index) => {
    const queryId = query.id || `query_${index + 1}`;

    try {
      // Convert to original format and call the working function
      const params: GithubFetchRequestParams = {
        owner: query.owner,
        repo: query.repo,
        branch: query.branch,
        filePath: query.filePath,
        startLine: query.startLine,
        endLine: query.endLine,
        contextLines: query.contextLines || 5,
        matchString: query.matchString,
        minified: query.minified !== undefined ? query.minified : true,
      };

      // Try original query first using the working function directly
      const result = await fetchGitHubFileContent(params);

      if (!result.isError) {
        // Success with original query
        const data = JSON.parse(result.content[0].text as string);
        return {
          queryId,
          originalQuery: query,
          result: data.data || data,
          fallbackTriggered: false,
        };
      }

      // Original query failed, try fallback if available
      if (query.fallbackParams) {
        const fallbackParams: GithubFetchRequestParams = {
          ...params,
          ...query.fallbackParams,
        };

        const fallbackResult = await fetchGitHubFileContent(fallbackParams);

        if (!fallbackResult.isError) {
          // Success with fallback query
          const data = JSON.parse(fallbackResult.content[0].text as string);
          return {
            queryId,
            originalQuery: query,
            result: data.data || data,
            fallbackTriggered: true,
            fallbackQuery: { ...query, ...query.fallbackParams },
          };
        }

        // Both failed - return fallback error
        return {
          queryId,
          originalQuery: query,
          result: { error: fallbackResult.content[0].text as string },
          fallbackTriggered: true,
          fallbackQuery: { ...query, ...query.fallbackParams },
        };
      }

      // No fallback available - return original error
      return {
        queryId,
        originalQuery: query,
        result: { error: result.content[0].text as string },
        fallbackTriggered: false,
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
  const successfulQueries = results.filter(r => !('error' in r.result)).length;
  const queriesWithFallback = results.filter(r => r.fallbackTriggered).length;

  return createResult({
    data: {
      results,
      summary: {
        totalQueries,
        successfulQueries,
        queriesWithFallback,
      },
    },
  });
}

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, filePath } = params;

    try {
      // Try to fetch file content directly
      const isCommitSha = branch.match(/^[0-9a-f]{40}$/);
      const apiPath = isCommitSha
        ? `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}` // Use contents API with ref for commit SHA
        : `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`; // Use contents API for branches/tags

      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (result.isError) {
        const errorMsg = result.content[0].text as string;

        // Silent fallback for main/master branches only
        if (
          errorMsg.includes('404') &&
          (branch === 'main' || branch === 'master')
        ) {
          const fallbackBranch = branch === 'main' ? 'master' : 'main';
          const fallbackPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${fallbackBranch}`;

          // Retry with fallback branch
          const fallbackResult = await executeGitHubCommand(
            'api',
            [fallbackPath],
            {
              cache: false,
            }
          );

          if (!fallbackResult.isError) {
            return await processFileContent(
              fallbackResult,
              owner,
              repo,
              fallbackBranch,
              filePath,
              params.minified,
              params.startLine,
              params.endLine,
              params.contextLines,
              params.matchString
            );
          }
        }

        // Return original error if fallback didn't work or wasn't applicable
        return result;
      }

      return await processFileContent(
        result,
        owner,
        repo,
        branch,
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
      error:
        'Path is a directory. Use github_view_repo_structure to list directory contents',
    });
  }

  const fileSize = typeof fileData.size === 'number' ? fileData.size : 0;
  const MAX_FILE_SIZE = 300 * 1024; // 300KB limit for better performance and reliability

  // Check file size with helpful message
  if (fileSize > MAX_FILE_SIZE) {
    const fileSizeKB = Math.round(fileSize / 1024);
    const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

    return createResult({
      error: `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
    });
  }

  // Get and decode content with validation
  if (!fileData.content) {
    return createResult({
      error: 'File is empty - no content to display',
    });
  }

  const base64Content = fileData.content.replace(/\s/g, ''); // Remove all whitespace

  if (!base64Content) {
    return createResult({
      error: 'File is empty - no content to display',
    });
  }

  let decodedContent: string;
  try {
    const buffer = Buffer.from(base64Content, 'base64');

    // Simple binary check - look for null bytes
    if (buffer.indexOf(0) !== -1) {
      return createResult({
        error:
          'Binary file detected. Cannot display as text - download directly from GitHub',
      });
    }

    decodedContent = buffer.toString('utf-8');
  } catch (decodeError) {
    return createResult({
      error:
        'Failed to decode file. Encoding may not be supported (expected UTF-8)',
    });
  }

  // Sanitize the decoded content for security
  const sanitizationResult = ContentSanitizer.sanitizeContent(decodedContent);
  decodedContent = sanitizationResult.content;

  // Add security warnings to the response if any issues were found
  const securityWarnings: string[] = [];
  if (sanitizationResult.hasSecrets) {
    securityWarnings.push(
      `Secrets detected and redacted: ${sanitizationResult.secretsDetected.join(', ')}`
    );
  }
  if (sanitizationResult.hasPromptInjection) {
    securityWarnings.push('Potential prompt injection detected and sanitized');
  }
  if (sanitizationResult.isMalicious) {
    securityWarnings.push(
      'Potentially malicious content detected and sanitized'
    );
  }
  if (sanitizationResult.warnings.length > 0) {
    securityWarnings.push(...sanitizationResult.warnings);
  }

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
        error: `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
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
        error: `Invalid startLine ${startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
      });
    }

    // Calculate actual range with context
    const contextStart = Math.max(1, startLine - contextLines);
    let adjustedEndLine = endLine;

    // Validate and auto-adjust endLine if provided
    if (endLine !== undefined) {
      if (endLine < startLine) {
        return createResult({
          error: `Invalid range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
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
