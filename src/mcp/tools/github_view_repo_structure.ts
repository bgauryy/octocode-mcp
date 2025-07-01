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

const DESCRIPTION = `Browse GitHub repository file structure and navigate directories. Essential for exploring project layout, finding documentation, configuration files, and source code. Returns file/folder listings with size information. Automatically handles branch detection. Parameters: owner (required - GitHub username/org), repo (required - repository name), branch (required), path (optional - directory path).`;

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
            'Repository owner/organization name (e.g., "facebook", "microsoft"). Do NOT include repository name.'
          ),

        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
          .describe(`Repository name under a organization. `),

        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
          .describe(
            'Branch name (e.g., "main", "master", "develop"). Tool will automatically try default branch if specified branch is not found.'
          ),

        path: z
          .string()
          .optional()
          .default('')
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .refine(path => path.length <= 500, 'Path too long')
          .describe(
            'Directory path within repository (e.g., "src", "docs", "src/components"). Leave empty for root directory. Do NOT start with slash.'
          ),
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
      const maxAttempts = branchesToTry.length;
      const triedBranches: string[] = [];

      for (const tryBranch of branchesToTry) {
        if (attemptCount >= maxAttempts) break;
        attemptCount++;
        triedBranches.push(tryBranch);

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
          continue;
        }
      }

      if (items.length === 0) {
        // Check repository existence only after content fetch fails
        const repoCheckResult = await executeGitHubCommand(
          'api',
          [`/repos/${owner}/${repo}`],
          {
            cache: false,
          }
        );

        if (repoCheckResult.isError) {
          const repoErrorMsg = repoCheckResult.content[0].text as string;
          if (repoErrorMsg.includes('404')) {
            return createResult({
              error: `Repository "${owner}/${repo}" not found. It might have been deleted, renamed, or made private. Use github_search_code to find current location.`,
            });
          } else if (repoErrorMsg.includes('403')) {
            return createResult({
              error: `Repository "${owner}/${repo}" exists but access is denied. Repository might be private or archived. Use api_status_check to verify permissions.`,
            });
          }
        }

        const errorMsg = lastError?.message || 'Unknown error';

        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          if (path) {
            const searchSuggestion = await suggestPathSearchFallback(
              owner,
              path
            );
            return createResult({
              error: `Path "${path}" not found in any branch (tried: ${triedBranches.join(', ')}).${searchSuggestion}`,
            });
          } else {
            return createResult({
              error: `Repository "${owner}/${repo}" structure not accessible. Repository might be empty, private, or you might not have sufficient permissions. Use github_search_code with owner="${owner}" to find accessible repositories.`,
            });
          }
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return createResult({
            error: `Access denied to "${owner}/${repo}". Repository exists but might be private/archived. Use api_status_check to verify permissions, or github_search_code with owner="${owner}" to find accessible repositories.`,
          });
        } else {
          const searchSuggestion = path
            ? await suggestPathSearchFallback(owner, path)
            : '';
          return createResult({
            error: `Failed to access "${owner}/${repo}": ${errorMsg}. Check network connection and repository permissions.${searchSuggestion}`,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createResult({
        error: `Failed to access repository "${owner}/${repo}": ${errorMessage}. Verify repository name, permissions, and network connection.`,
      });
    }
  });
}

/**
 * Smart branch detection with automatic fallback to common branch names.
 * Now includes more comprehensive branch detection and better error handling.
 */
async function getSmartBranchFallback(
  owner: string,
  repo: string,
  requestedBranch: string
): Promise<string[]> {
  const branches = new Set([requestedBranch]);

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

      if (defaultBranch) {
        branches.add(defaultBranch);
      }
    }
  } catch {
    // If we can't get repo info, proceed with standard fallbacks
  }

  // Add only main/master as fallback branches
  const commonBranches = ['main', 'master'];
  commonBranches.forEach(branch => branches.add(branch));

  // Convert Set back to array, with requested branch first
  const branchesArray = Array.from(branches);
  branchesArray.sort((a, b) => {
    if (a === requestedBranch) return -1;
    if (b === requestedBranch) return 1;
    return 0;
  });

  return branchesArray;
}

// Helper function to suggest path search strategy
async function suggestPathSearchFallback(
  owner: string,
  path: string
): Promise<string> {
  try {
    // Extract last path segment and try to find in same organization
    const pathSegment = path.split('/').pop() || path;
    const searchResult = await executeGitHubCommand(
      'api',
      [
        `/search/code?q=${encodeURIComponent(pathSegment)}+in:path+org:${owner}`,
      ],
      { cache: false }
    );

    if (!searchResult.isError) {
      const results = JSON.parse(searchResult.content[0].text as string);
      if (results.total_count > 0) {
        const firstMatch = results.items[0];
        return ` Directory might be in ${firstMatch.repository.full_name}. Try these searches:\n1. github_search_code with query="${pathSegment}" owner="${owner}"\n2. github_search_code with query="path:${path}" owner="${owner}"`;
      }
    }
  } catch {
    // Fallback to generic message if search fails
  }

  return ` Try these searches:\n1. github_search_code with query="${path.split('/').pop()}" owner="${owner}"\n2. github_search_code with query="path:${path}"`;
}
