import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubRepositoryStructureParams,
  GitHubApiFileItem,
} from '../../types';
import { createResult } from '../responses';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export const GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME = 'githubViewRepoStructure';

const DESCRIPTION = `Explore repository structure and navigate directories. Auto-detects branches and provides file/folder listings with size information. Parameters: owner (required - GitHub username/org), repo (required - repository name), branch (required), path (optional).`;

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.registerTool(
    GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
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
            `Repository owner/org name (e.g., 'microsoft', 'google', NOT 'microsoft/vscode')`
          ),

        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
          .describe('Repository name (case-sensitive)'),

        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
          .describe('Branch name. Falls back to default branch if not found'),

        path: z
          .string()
          .optional()
          .default('')
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .refine(path => path.length <= 500, 'Path too long')
          .describe('Directory path within repository. Leave empty for root.'),
      },
      annotations: {
        title: 'GitHub Repository Explorer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubRepositoryStructureParams): Promise<CallToolResult> => {
      try {
        const result = await viewRepositoryStructure(args);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return createResult({
          error: `Failed to explore repository. ${errorMessage}. Verify repository exists and is accessible`,
        });
      }
    }
  );
}

/**
 * Views the structure of a GitHub repository at a specific path.
 * Optimized for code analysis workflows with smart defaults and clear errors.
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
      let items: GitHubApiFileItem[] = [];
      let usedBranch = branch;
      let lastError: Error | null = null;
      let attemptCount = 0;
      const maxAttempts = 3; // Prevent infinite loops

      for (const tryBranch of branchesToTry) {
        if (attemptCount >= maxAttempts) break;
        attemptCount++;
        try {
          const apiPath = `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${tryBranch}`;
          const result = await executeGitHubCommand('api', [apiPath], {
            cache: false,
          });

          if (!result.isError) {
            const execResult = JSON.parse(result.content[0].text as string);
            const apiItems = execResult.result;

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
            return createResult({
              error: `Path "${path}" not found. Verify the path or use github_search_code to find files`,
            });
          } else {
            return createResult({
              error: `Repository not found: ${owner}/${repo}. Check spelling and case sensitivity`,
            });
          }
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createResult({
            error: `Access denied to ${owner}/${repo}. Repository may be private - use api_status_check`,
          });
        } else {
          return createResult({
            error: `Failed to access ${owner}/${repo}. Check network connection`,
          });
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

      // Create simplified, token-efficient structure
      const files = limitedItems
        .filter(item => item.type === 'file')
        .map(item => ({
          name: item.name,
          size: item.size,
          url: item.path, // Use path for fetching
        }));

      const folders = limitedItems
        .filter(item => item.type === 'dir')
        .map(item => ({
          name: item.name,
          url: item.path, // Use path for browsing
        }));

      return createResult({
        data: {
          repository: `${owner}/${repo}`,
          branch: usedBranch,
          path: cleanPath || '/',
          githubBasePath: `https://api.github.com/repos/${owner}/${repo}/contents/`,
          files: {
            count: files.length,
            files: files,
          },
          folders: {
            count: folders.length,
            folders: folders,
          },
        },
      });
    } catch (error) {
      return createResult({
        error: `Failed to access repository. ${error}. Verify repository name and authentication`,
      });
    }
  });
}

/**
 * Smart branch detection with automatic fallback to common branch names.
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
      const execResult = JSON.parse(repoInfoResult.content[0].text as string);
      const repoData = execResult.result;
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
