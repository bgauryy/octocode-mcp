import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createErrorResult, createSuccessResult } from '../../utils/responses';
import { GitHubFileContentParams, GitHubFileContentResult } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_get_file_content';

const DESCRIPTION = `Read file content for implementation analysis. Smart branch detection and binary handling. Essential for code study workflows.`;

// Define the expected structure of the raw API response for a file
interface RawGitHubApiFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string; // API URL
  html_url: string; // Browser URL
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir' | 'symlink' | 'submodule'; // We are interested in 'file'
  content?: string; // Base64 encoded content
  encoding?: 'base64'; // GitHub API typically returns 'base64' for file content
}

export function registerFetchGitHubFileContentTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        owner: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
          .describe(
            `Repository owner/organization. Required for accessing repositories.`
          ),
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/)
          .describe(`Repository name. Case-sensitive.`),
        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/)
          .describe(
            `Branch name. Auto-fallback to common branches (main, master) if not found.`
          ),
        filePath: z
          .string()
          .min(1)
          .max(1024) // Increased max path length
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .describe(
            `File path from repository root. Use github_get_contents first to explore structure.`
          ),
      },
      annotations: {
        title: 'GitHub File Content Reader',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubFileContentParams): Promise<CallToolResult> => {
      // Directly await and return the result from the main fetching logic
      return await fetchGitHubFileContentWithCache(args);
    }
  );
}

async function fetchGitHubFileContentWithCache(
  params: GitHubFileContentParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);
  return withCache(cacheKey, async () => {
    return fetchGitHubFileContentLogic(params);
  });
}

async function fetchGitHubFileContentLogic(
  params: GitHubFileContentParams
): Promise<CallToolResult> {
  const { owner, repo, filePath } = params;
  const requestedBranch = params.branch; // Keep original for fallback info

  const branchesToTry = await getSmartBranchFallback(
    owner,
    repo,
    requestedBranch
  );
  let lastErrorResult: CallToolResult | null = null;

  for (const currentBranch of branchesToTry) {
    try {
      const apiPath = `/repos/${owner}/${repo}/contents/${filePath}?ref=${currentBranch}`;
      // Use 'Accept' header for raw content, though gh api for contents endpoint already provides base64
      const result = await executeGitHubCommand(
        'api',
        [apiPath /*, '-H', 'Accept: application/vnd.github.v3.raw'*/],
        {
          cache: false, // Cache is handled by withCache wrapper
        }
      );

      if (result.isError) {
        const errorMsg = result.content[0].text as string;
        if (errorMsg.includes('404')) {
          lastErrorResult = createErrorResult(
            `File not found on ${currentBranch} | Try: check file path, verify repository access, or try different branch`
          );
          continue; // Try next branch
        } else if (errorMsg.includes('403')) {
          return createErrorResult(
            `Access denied | Try: check repository permissions, verify GitHub token, or confirm repository exists`
          );
        }
        // For other errors from executeGitHubCommand, store and continue if it's a branch issue potentially
        lastErrorResult = result;
        continue;
      }

      // Successful API call for this branch
      const execResult = JSON.parse(result.content[0].text as string);
      const rawApiData = JSON.parse(execResult.result) as
        | RawGitHubApiFileContent
        | RawGitHubApiFileContent[];

      // The API returns an array if the path is a directory, object if it's a file.
      if (Array.isArray(rawApiData)) {
        return createErrorResult(
          `Path is a directory | Try: use github_get_contents tool, or specify a file path`
        );
      }

      return processApiFileResponse(
        rawApiData,
        owner,
        repo,
        currentBranch,
        requestedBranch
      );
    } catch (error) {
      // Catch errors from JSON parsing or other unexpected issues within the loop
      lastErrorResult = createErrorResult(
        `Error fetching file on ${currentBranch}`,
        error
      );
    }
  }

  // If all branches failed
  if (lastErrorResult) {
    return lastErrorResult;
  }
  // Should not be reached if getSmartBranchFallback always provides at least one branch
  return createErrorResult(
    `File not found on any branch | Try: check file path, verify repository access, or confirm file exists`
  );
}

function processApiFileResponse(
  apiData: RawGitHubApiFileContent,
  owner: string,
  repo: string,
  branchUsed: string,
  requestedBranch: string
): CallToolResult {
  if (apiData.type !== 'file') {
    return createErrorResult(
      `Path is ${apiData.type}, not a file | Try: use appropriate tool for ${apiData.type} or specify file path`
    );
  }

  const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB limit
  if (apiData.size > MAX_FILE_SIZE_BYTES) {
    return createErrorResult(
      `File too large: ${Math.round(apiData.size / 1024)}KB (limit: ${Math.round(MAX_FILE_SIZE_BYTES / 1024)}KB) | Try: use download URL or search specific sections`
    );
  }

  if (apiData.encoding !== 'base64' || !apiData.content) {
    // If content is empty or encoding is not base64, treat as empty text file or report error.
    // GitHub API for files usually guarantees base64 encoded content.
    if (apiData.size === 0 && !apiData.content) {
      // Explicitly empty file
      const emptyResult: GitHubFileContentResult = {
        repository_full_name: `${owner}/${repo}`,
        file_path_from_repo_root: apiData.path,
        branch_used: branchUsed,
        size_bytes: 0,
        content_type: 'text',
        content: '',
        encoding_source: 'utf-8', // Representing empty as decoded text
        html_url: apiData.html_url,
        download_url: apiData.download_url,
      };
      if (requestedBranch !== branchUsed) {
        emptyResult.branch_fallback_info = {
          requested_branch: requestedBranch,
          used_branch: branchUsed,
          message: `Requested branch '${requestedBranch}' not found. Used '${branchUsed}'.`,
        };
      }
      return createSuccessResult(emptyResult);
    }
    return createErrorResult(
      `File has unexpected encoding: ${apiData.encoding || 'none'}`
    );
  }

  const base64Content = apiData.content.replace(/\s/g, ''); // Remove whitespace just in case
  let decodedBuffer: Buffer;
  try {
    decodedBuffer = Buffer.from(base64Content, 'base64');
  } catch (bufferError) {
    return createErrorResult(`Failed to decode base64 content`, bufferError);
  }

  // Heuristic: Check for null bytes in the first 1KB of decoded content to detect binary
  const sample = decodedBuffer.slice(0, 1024);
  const isBinary = sample.includes(0);

  const successData: GitHubFileContentResult = {
    repository_full_name: `${owner}/${repo}`,
    file_path_from_repo_root: apiData.path, // Use path from API response
    branch_used: branchUsed,
    size_bytes: apiData.size,
    content_type: isBinary ? 'binary' : 'text',
    content: isBinary ? base64Content : decodedBuffer.toString('utf-8'),
    encoding_source: isBinary ? 'base64' : 'utf-8',
    html_url: apiData.html_url,
    download_url: apiData.download_url,
  };

  if (requestedBranch !== branchUsed) {
    successData.branch_fallback_info = {
      requested_branch: requestedBranch,
      used_branch: branchUsed,
      message: `Requested branch '${requestedBranch}' not found. Used '${branchUsed}'.`,
    };
  }

  return createSuccessResult(successData);
}

// Helper function to determine branches to try (copied from github_view_repo_structure.ts, should be utility)
async function getSmartBranchFallback(
  owner: string,
  repo: string,
  requestedBranch: string
): Promise<string[]> {
  const branches: string[] = [requestedBranch];

  // Try to get default branch if requested is not 'main' or 'master' already
  if (requestedBranch !== 'main' && requestedBranch !== 'master') {
    try {
      const repoInfoPath = `/repos/${owner}/${repo}`;
      const repoResult = await executeGitHubCommand('api', [repoInfoPath], {
        cache: true,
      }); // Cache repo info
      if (!repoResult.isError) {
        const repoExecResult = JSON.parse(repoResult.content[0].text as string);
        const repoData = JSON.parse(repoExecResult.result);
        if (
          repoData.default_branch &&
          !branches.includes(repoData.default_branch)
        ) {
          branches.push(repoData.default_branch);
        }
      }
    } catch (e) {
      /* Ignore errors fetching default branch, proceed with fallbacks */
    }
  }

  // Add common fallbacks if not already included
  if (!branches.includes('main')) branches.push('main');
  if (!branches.includes('master')) branches.push('master');

  return [...new Set(branches)]; // Deduplicate
}
