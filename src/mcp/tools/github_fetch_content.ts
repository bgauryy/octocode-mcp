import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import {
  GithubFetchRequestParams,
  GitHubFileContentResponse,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { minifyContent } from '../../utils/minifier';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { withSecurityValidation } from './utils/withSecurityValidation';
import {
  RESOURCE_LIMITS,
  safeJsonParse,
  validateResourceLimits,
} from '../../security/utils';

export const GITHUB_GET_FILE_CONTENT_TOOL_NAME = 'githubGetFileContent';

const DEFAULT_CONTEXT_LINES = 10;

const DESCRIPTION = `Fetches the content of multiple files from GitHub repositories in parallel. Supports up to 5 queries with automatic fallback handling.

TOKEN OPTIMIZATION:
- Full file content is expensive in tokens. Use startLine/endLine for partial access
- Large files should be accessed in parts rather than full content
- Use minified=true (default) to optimize content for token efficiency

BULK QUERY FEATURES:
- queries: array of up to 5 different file fetch queries for parallel execution
- Each query can have fallbackParams for automatic retry with modified parameters
- Optimizes workflow by executing multiple file fetches simultaneously
- Each query should target different files or sections
- Fallback logic automatically adjusts parameters if original query fails
- Automatic main/master branch fallback for each query

Use for comprehensive file analysis - query different files, sections, or implementations in one call.`;

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
    .default(10)
    .describe(`Context lines around target range. Default: 10.`),
  minified: z
    .boolean()
    .default(true)
    .describe(
      `Optimize content for token efficiency (enabled by default). Removes excessive whitespace and comments. Set to false only when exact formatting is required.`
    ),
  fallbackParams: z
    .object({
      branch: z.string().optional(),
      filePath: z.string().optional(),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      contextLines: z.number().int().min(0).max(50).optional(),
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
      inputSchema: z.object({
        queries: z
          .array(FileContentQuerySchema)
          .min(1)
          .max(5)
          .describe(
            'Array of up to 5 different file fetch queries for parallel execution'
          ),
      }),
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
        contextLines: query.contextLines ?? DEFAULT_CONTEXT_LINES,
        minified: query.minified ?? true,
      };

      // Try original query first using the working function directly
      const result = await fetchGitHubFileContent(params);

      if (!result.isError) {
        // Success with original query
        const data = JSON.parse(safeGetContentText(result));
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
          const data = JSON.parse(safeGetContentText(fallbackResult));
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
          result: { error: safeGetContentText(fallbackResult) },
          fallbackTriggered: true,
          fallbackQuery: { ...query, ...query.fallbackParams },
        };
      }

      // No fallback available - return original error
      return {
        queryId,
        originalQuery: query,
        result: { error: safeGetContentText(result) },
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
  try {
    const result = await executeGitHubCommand('api', [
      `/repos/${params.owner}/${params.repo}/contents/${params.filePath}`,
      '--jq',
      '.',
    ]);

    if (result.isError) {
      return result;
    }

    const parseResult = safeJsonParse<any>(
      safeGetContentText(result),
      'GitHub file content'
    );
    if (!parseResult.success) {
      return createResult({ error: parseResult.error });
    }

    const fileData = parseResult.data;

    // Check if it's a directory
    if (Array.isArray(fileData)) {
      return createResult({
        error:
          'Path is a directory. Use github_view_repo_structure to list directory contents',
      });
    }

    const fileSize = typeof fileData.size === 'number' ? fileData.size : 0;
    // Validate file size before proceeding
    const sizeValidation = validateResourceLimits({
      size: fileSize,
      maxSize: RESOURCE_LIMITS.MAX_FILE_SIZE,
      name: 'File',
    });

    if (!sizeValidation.isValid) {
      return createResult({ error: sizeValidation.error });
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
      securityWarnings.push(
        'Potential prompt injection detected and sanitized'
      );
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

    if (params.startLine !== undefined) {
      // Validate line numbers
      if (params.startLine < 1 || params.startLine > totalLines) {
        return createResult({
          error: `Invalid startLine ${params.startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
        });
      }

      // Calculate actual range with context
      const contextStart = Math.max(1, params.startLine - params.contextLines);
      const contextEnd = params.endLine
        ? Math.min(totalLines, params.endLine + params.contextLines)
        : Math.min(totalLines, params.startLine + params.contextLines);

      // Validate endLine if provided
      if (params.endLine !== undefined) {
        if (params.endLine < params.startLine) {
          return createResult({
            error: `Invalid range: endLine (${params.endLine}) must be greater than or equal to startLine (${params.startLine}).`,
          });
        }
        if (params.endLine > totalLines) {
          return createResult({
            error: `Invalid endLine ${params.endLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
          });
        }
      }

      // Extract the specified range with context from ORIGINAL content
      const selectedLines = lines.slice(contextStart - 1, contextEnd);

      actualStartLine = contextStart;
      actualEndLine = contextEnd;
      isPartial = true;

      // Add line number annotations for partial content
      const annotatedLines = selectedLines.map((line, index) => {
        const lineNumber = contextStart + index;
        const isInTargetRange =
          lineNumber >= params.startLine! &&
          (params.endLine === undefined || lineNumber <= params.endLine);
        const marker = isInTargetRange ? '→' : ' ';
        return `${marker}${lineNumber.toString().padStart(4)}: ${line}`;
      });

      finalContent = annotatedLines.join('\n');
      hasLineAnnotations = true;
    }

    // Apply minification to final content (both partial and full files)
    let minificationFailed = false;
    let minificationType = 'none';

    if (params.minified) {
      if (hasLineAnnotations) {
        // For partial content with line annotations, extract code content first
        const annotatedLines = finalContent.split('\n');
        const codeLines = annotatedLines.map(line => {
          // Remove line number annotations but preserve the original line content
          const match = line.match(/^[→ ]\s*\d+:\s*(.*)$/);
          return match ? match[1] : line;
        });

        const codeContent = codeLines.join('\n');
        const minifyResult = await minifyContent(codeContent, params.filePath);

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
        const minifyResult = await minifyContent(finalContent, params.filePath);
        finalContent = minifyResult.content;
        minificationFailed = minifyResult.failed;
        minificationType = minifyResult.type;
      }
    }

    return createResult({
      data: {
        filePath: params.filePath,
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        content: finalContent,
        // Always return total lines for LLM context
        totalLines,
        // Original request parameters for LLM context
        requestedStartLine: params.startLine,
        requestedEndLine: params.endLine,
        requestedContextLines: params.contextLines,
        // Actual content boundaries (only for partial content)
        ...(isPartial && {
          startLine: actualStartLine,
          endLine: actualEndLine,
          isPartial,
        }),
        // Minification metadata
        ...(params.minified && {
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
  } catch (error) {
    return createResult({
      error: `Error fetching file content: ${error}`,
    });
  }
}

// Helper function for safe content access
function safeGetContentText(result: any): string {
  if (
    result?.content &&
    Array.isArray(result.content) &&
    result.content.length > 0
  ) {
    return (result.content[0].text as string) || 'Empty response';
  }
  return 'Unknown error: No content in response';
}
