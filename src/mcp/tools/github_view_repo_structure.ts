import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubRepositoryContentsResult,
  GitHubRepositoryStructureParams,
} from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
  createErrorResult,
  createSuccessResult,
} from '../../utils/responses';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_CONTENTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_CONTENTS],
    {
      owner: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
          'Invalid GitHub username/org format'
        )
        .describe(
          `Repository owner/organization (e.g., 'microsoft', 'facebook'). Use github_search_repositories to discover valid owners.`
        ),

      repo: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
        .describe(
          'Repository name (e.g., "vscode", "react"). Case-sensitive. Use github_search_repositories to find exact names.'
        ),

      branch: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
        .describe(
          "Target branch name (e.g., 'main', 'canary', 'develop'). " +
            'Auto-detects repository default if not found. ' +
            'Use github_search_repositories or api calls to discover valid branches first.'
        ),

      path: z
        .string()
        .optional()
        .default('')
        .refine(path => !path.includes('..'), 'Path traversal not allowed')
        .refine(path => path.length <= 500, 'Path too long')
        .describe(
          'Directory path within repository (e.g., "src/components", "packages/core"). ' +
            'Leave empty for root. Use previous results to navigate deeper.'
        ),
    },
    {
      title: TOOL_NAMES.GITHUB_GET_CONTENTS,
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_CONTENTS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubRepositoryStructureParams) => {
      try {
        const result = await viewRepositoryStructure(args);

        if (result.isError) {
          return createResult(result.content[0].text, true);
        }

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse<{
            path: string;
            baseUrl: string;
            files: Array<{ name: string; size: number; url: string }>;
            folders: string[];
            branchFallback?: {
              requested: string;
              used: string;
              message: string;
            };
          }>(result.content[0].text as string);

          if (parsed) {
            const typedResult: GitHubRepositoryContentsResult = {
              path: data.path,
              baseUrl: data.baseUrl,
              files: data.files || [],
              folders: data.folders || [],
              ...(data.branchFallback && {
                branchFallback: data.branchFallback,
              }),
            };
            return createResult(typedResult);
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        const context = `${args.owner}/${args.repo}`;

        return createResult(
          `Repository exploration failed: ${errorMessage}. Context: ${context} on ${args.branch}${args.path ? ` at ${args.path}` : ''}`,
          true
        );
      }
    }
  );
}

/**
 * Views the structure of a GitHub repository at a specific path.
 *
 * Features:
 * - Smart branch detection: fetches repository default branch automatically
 * - Intelligent fallback: tries requested -> default -> common branches
 * - Input validation: prevents path traversal and validates GitHub naming
 * - Clear error context: provides descriptive error messages
 * - Efficient caching: avoids redundant API calls
 */
export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, path = '' } = params;

    try {
      // Clean up path
      const cleanPath = path.startsWith('/') ? path.substring(1) : path;

      // Try the requested branch first, then fallback to main/master
      const branchesToTry = await getSmartBranchFallback(owner, repo, branch);
      let items: Array<{
        name: string;
        path: string;
        size: number;
        type: 'file' | 'dir';
        url: string;
      }> = [];
      let usedBranch = branch;
      let lastError: Error | null = null;

      for (const tryBranch of branchesToTry) {
        try {
          const apiPath = `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${tryBranch}`;
          const result = await executeGitHubCommand('api', [apiPath], {
            cache: false,
          });

          if (!result.isError) {
            const execResult = JSON.parse(result.content[0].text as string);
            const apiItems = JSON.parse(execResult.result);

            items = Array.isArray(apiItems) ? apiItems : [apiItems];
            usedBranch = tryBranch;
            break;
          } else {
            lastError = new Error(result.content[0].text as string);
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          // Try next branch
          continue;
        }
      }

      if (items.length === 0) {
        // Use the most descriptive error message
        const errorMsg = lastError?.message || 'Unknown error';

        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          if (path) {
            throw new Error(
              `Path "${path}" not found in repository ${owner}/${repo}.`
            );
          } else {
            throw new Error(
              `Repository ${owner}/${repo} not found or no accessible branches. ` +
                `Tried branches: ${branchesToTry.join(', ')}`
            );
          }
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          throw new Error(`Access denied to repository ${owner}/${repo}`);
        } else {
          throw new Error(
            `Repository ${owner}/${repo} not found or path "${path}" doesn't exist`
          );
        }
      }

      // Limit total items to 100 for efficiency
      const limitedItems = items.slice(0, 100);

      // Sort: directories first, then alphabetically
      limitedItems.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Create base URL for GitHub API - construct it reliably from the parameters
      const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath ? cleanPath + '/' : ''}`;

      // Transform to lean structure with simplified paths and URLs
      const files = limitedItems
        .filter(item => item.type === 'file')
        .map(item => {
          // Simplify path by removing redundant prefix
          let simplifiedPath = item.name; // Use just the filename for files in current directory

          // If we're in a subdirectory and the item path is longer than just the name,
          // show relative path from current directory
          if (cleanPath && item.path.startsWith(cleanPath + '/')) {
            simplifiedPath = item.path.substring(cleanPath.length + 1);
          } else if (!cleanPath) {
            // At root level, use the full path but without leading slash
            simplifiedPath = item.path;
          }

          // Extract just the filename and query params from the URL
          const urlParts = item.url.split('/');
          const filename = urlParts[urlParts.length - 1]; // Gets "filename?ref=branch"

          return {
            name: simplifiedPath,
            size: item.size,
            url: filename, // Just the filename and query params
          };
        });

      const folders = limitedItems
        .filter(item => item.type === 'dir')
        .map(item => `${item.name}/`);

      const result: GitHubRepositoryContentsResult = {
        path: `${owner}/${repo}${path ? `/${path}` : ''}`,
        baseUrl: `${baseUrl}?ref=${usedBranch}`, // Include complete base URL with branch
        files,
        folders,
        ...(usedBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: usedBranch,
            message: `Used '${usedBranch}' instead of '${branch}'`,
          },
        }),
      };

      return createSuccessResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Repository access failed: ${owner}/${repo}${path ? ` at ${path}` : ''}`,
        new Error(errorMessage)
      );
    }
  });
}

/**
 * Intelligently determines the best branches to try for a repository.
 * Attempts to fetch the default branch first, then falls back to common branches.
 */
async function getSmartBranchFallback(
  owner: string,
  repo: string,
  requestedBranch: string
): Promise<string[]> {
  const branches = [requestedBranch];

  try {
    // Try to get repository info to find default branch
    const repoInfoResult = await executeGitHubCommand(
      'api',
      [`/repos/${owner}/${repo}`],
      {
        cache: false,
      }
    );

    if (!repoInfoResult.isError) {
      const repoData = JSON.parse(
        JSON.parse(repoInfoResult.content[0].text as string).result
      );
      const defaultBranch = repoData.default_branch;

      if (defaultBranch && !branches.includes(defaultBranch)) {
        branches.push(defaultBranch);
      }
    }
  } catch {
    // If we can't get repo info, proceed with standard fallbacks
  }

  // Add common branch names if not already included
  const commonBranches = ['main', 'master', 'develop', 'dev'];
  commonBranches.forEach(branch => {
    if (!branches.includes(branch)) {
      branches.push(branch);
    }
  });

  return branches;
}
