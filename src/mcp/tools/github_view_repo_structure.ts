import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubRepositoryContentsResult,
  GitHubRepositoryStructureParams,
  GitHubRepositoryEntry,
  GitHubRepositoryFileEntry,
  GitHubRepositoryFolderEntry,
} from '../../types';
import { createErrorResult, createSuccessResult } from '../../utils/responses';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

const TOOL_NAME = 'github_get_contents';

const DESCRIPTION = `Explore repository structure for research navigation. Smart branch fallbacks and directory mapping. Essential first step for code analysis.`;

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        owner: z
          .string()
          .min(1)
          .max(100)
          .regex(
            /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
            'Invalid GitHub username/org format'
          )
          .describe(
            `Repository owner/organization from api_status_check results. Required for repository access.`
          ),

        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
          .describe('Repository name. Case-sensitive.'),

        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
          .describe('Target branch name. Auto-detects default if not found.'),

        path: z
          .string()
          .optional()
          .default('')
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .refine(path => path.length <= 500, 'Path too long')
          .describe('Directory path within repository. Leave empty for root.'),
      },
      annotations: {
        title: 'GitHub Repository Contents',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubRepositoryStructureParams): Promise<CallToolResult> => {
      try {
        return await viewRepositoryStructure(args);
      } catch (error) {
        return createErrorResult(
          `Repository exploration failed | Try: verify access, check permissions, or confirm repository exists`,
          error as Error
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
      const cleanPath = path.startsWith('/')
        ? path.substring(1)
        : path.endsWith('/') && path.length > 1
          ? path.substring(0, path.length - 1)
          : path;

      // Try the requested branch first, then fallback to main/master
      const branchesToTry = await getSmartBranchFallback(owner, repo, branch);
      let rawApiItems: Array<{
        name: string;
        path: string; // Full path from repo root
        size: number;
        type: 'file' | 'dir' | 'symlink' | 'submodule'; // GitHub API can return other types
        url: string; // API URL to the content
        html_url: string; // URL to view in browser
        download_url: string | null;
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

            rawApiItems = Array.isArray(apiItems) ? apiItems : [apiItems];
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

      if (rawApiItems.length === 0) {
        // Use the most descriptive error message
        const errorMsg = lastError?.message || 'Unknown error';

        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          if (path) {
            throw new Error(
              `Path "${path}" not found | Try: verify path, check spelling, or use code search`
            );
          } else {
            throw new Error(
              `Repository not found: ${owner}/${repo} | Try: verify names, check spelling, or confirm access`
            );
          }
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          throw new Error(
            `Access denied to ${owner}/${repo} | Try: check permissions, verify token, or confirm repository access`
          );
        } else {
          throw new Error(
            `Access failed: ${owner}/${repo} | Try: check connection, verify authentication, or confirm repository exists`
          );
        }
      }

      // Limit total items to 100 for efficiency
      const limitedItems = rawApiItems.slice(0, 100);

      // Sort: directories first, then alphabetically
      limitedItems.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      const processedItems: GitHubRepositoryEntry[] = limitedItems
        .map(item => {
          if (item.type === 'file') {
            return {
              name: item.name,
              type: 'file',
              size: item.size,
              path_from_repo_root: item.path,
              html_url: item.html_url,
              download_url: item.download_url,
            } as GitHubRepositoryFileEntry;
          } else if (item.type === 'dir') {
            return {
              name: item.name, // GitHub API returns dir name without trailing slash
              type: 'dir',
              path_from_repo_root: item.path,
              html_url: item.html_url,
            } as GitHubRepositoryFolderEntry;
          } else {
            // Handle symlinks or other types if necessary, or filter them out
            // For now, filter out unhandled types to ensure type safety for items array
            return null;
          }
        })
        .filter(Boolean) as GitHubRepositoryEntry[]; // Filter out nulls and assert type

      const successData: GitHubRepositoryContentsResult = {
        repository_full_name: `${owner}/${repo}`,
        listed_path_from_repo_root: cleanPath,
        branch_used: usedBranch,
        items: processedItems,
      };

      if (usedBranch !== branch) {
        successData.branch_fallback = {
          requested_branch: branch,
          used_branch: usedBranch,
          message: `Requested branch '${branch}' not found. Using '${usedBranch}'.`,
        };
      }

      return createSuccessResult(successData);
    } catch (error) {
      // Ensure errors from this function are CallToolResult compliant
      if (error instanceof Error) {
        return createErrorResult(error.message);
      }
      return createErrorResult(
        'Failed to view repository structure due to an unknown error.'
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
