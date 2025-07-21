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
import { filterItems } from './github_view_repo_structure_filters';

export const GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME = 'githubViewRepoStructure';

const DESCRIPTION = `Explore GitHub repository structure and validate repository access.

PROJECT UNDERSTANDING:
- Try to understand more by the structure of the project and the files in the project
- Identify key directories and file patterns
- fetch important files for better understanding

DEPTH CONTROL:
- Default depth is 2 levels for balanced performance and insight
- Maximum depth is 4 levels to prevent excessive API calls
- Depth 1: Shows only immediate files/folders in the specified path
- Depth 2+: Recursively explores subdirectories up to the specified depth
- Higher depths provide more comprehensive project understanding but use more API calls

IMPORTANT:
- verify default branch (use main or master if can't find default branch)
- verify path before calling the tool to avoid errors
- Start with root path to understand actual repository structure and then navigate to specific directories based on research needs
- Check repository's default branch as it varies between repositories
- Verify path exists - don't assume repository structure
- Verify repository existence and accessibility
- Validate paths before accessing specific files. Use github search code to find correct paths if unsure

`;

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
            'Branch name. Default branch varies between repositories. Tool will automatically try default branch if specified branch is not found, but it is more efficient to verify the correct branch first.'
          ),

        path: z
          .string()
          .optional()
          .default('')
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .refine(path => path.length <= 500, 'Path too long')
          .describe(
            'Directory path within repository. Start with empty path to see actual repository structure first. Do not assume repository structure or nested paths exist. Do not start with slash. Verify path exists before using specific directories.'
          ),

        depth: z
          .number()
          .int()
          .min(1, 'Depth must be at least 1')
          .max(4, 'Maximum depth is 4 to avoid excessive API calls')
          .optional()
          .default(2)
          .describe(
            'Depth of directory structure to explore. Default is 2. Maximum is 4 to prevent excessive API calls and maintain performance.'
          ),

        includeIgnored: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, shows all files and folders including configuration files, lock files, hidden directories, etc. Default is false to show only relevant code files and directories. for optimization'
          ),

        showMedia: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, shows media files (images, videos, audio, documents). Default is false to hide media files and focus on code structure.'
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
    const {
      owner,
      repo,
      branch,
      path = '',
      depth = 2,
      includeIgnored = false,
      showMedia = false,
    } = params;

    try {
      // Clean up path
      const cleanPath = path.startsWith('/') ? path.substring(1) : path;

      // Try the requested branch first - handle empty path correctly
      const apiPath = cleanPath
        ? `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`
        : `/repos/${owner}/${repo}/contents?ref=${branch}`;

      const result = await executeGitHubCommand('api', [apiPath], {
        cache: false,
      });

      if (!result.isError) {
        const execResult = JSON.parse(result.content[0].text as string);
        const apiItems = execResult.result;
        const items = Array.isArray(apiItems) ? apiItems : [apiItems];

        return await formatRepositoryStructureWithDepth(
          owner,
          repo,
          branch,
          cleanPath,
          items,
          depth,
          includeIgnored,
          showMedia
        );
      }

      // If initial request failed, start enhanced fallback mechanism
      const errorMsg = result.content[0].text as string;

      // Check repository existence first
      const repoCheckResult = await executeGitHubCommand(
        'api',
        [`/repos/${owner}/${repo}`],
        {
          cache: false,
        }
      );

      if (repoCheckResult.isError) {
        return handleRepositoryNotFound(
          owner,
          repo,
          repoCheckResult.content[0].text as string
        );
      }

      // Enhanced fallback strategy for branch/path errors
      if (errorMsg.includes('404')) {
        // Get the actual default branch from the repo info we already fetched
        let defaultBranch = 'main';
        let repoDefaultBranchFound = false;

        try {
          const repoData = JSON.parse(
            repoCheckResult.content[0].text as string
          );
          defaultBranch = repoData.default_branch || 'main';
          repoDefaultBranchFound = true;
        } catch (e) {
          // Keep default as 'main' if parsing fails
        }

        // If we found the actual default branch, try it first
        if (repoDefaultBranchFound && defaultBranch !== branch) {
          const defaultBranchPath = `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${defaultBranch}`;
          const defaultBranchResult = await executeGitHubCommand(
            'api',
            [defaultBranchPath],
            {
              cache: false,
            }
          );

          if (!defaultBranchResult.isError) {
            const execResult = JSON.parse(
              defaultBranchResult.content[0].text as string
            );
            const apiItems = execResult.result;
            const items = Array.isArray(apiItems) ? apiItems : [apiItems];

            return await formatRepositoryStructureWithDepth(
              owner,
              repo,
              defaultBranch,
              cleanPath,
              items,
              depth,
              includeIgnored,
              showMedia
            );
          }
        }

        // Try additional common branches
        const commonBranches = ['main', 'master', 'develop'];
        const triedBranches = [branch];

        if (repoDefaultBranchFound) {
          triedBranches.push(defaultBranch);
        }

        for (const tryBranch of commonBranches) {
          if (triedBranches.includes(tryBranch)) continue;

          const tryBranchPath = `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${tryBranch}`;
          const tryBranchResult = await executeGitHubCommand(
            'api',
            [tryBranchPath],
            {
              cache: false,
            }
          );

          triedBranches.push(tryBranch);

          if (!tryBranchResult.isError) {
            const execResult = JSON.parse(
              tryBranchResult.content[0].text as string
            );
            const apiItems = execResult.result;
            const items = Array.isArray(apiItems) ? apiItems : [apiItems];

            return await formatRepositoryStructureWithDepth(
              owner,
              repo,
              tryBranch,
              cleanPath,
              items,
              depth,
              includeIgnored,
              showMedia
            );
          }
        }

        // All branches failed - return helpful error
        return handlePathNotFound(
          owner,
          repo,
          cleanPath,
          triedBranches,
          defaultBranch,
          repoDefaultBranchFound
        );
      }

      // Handle other errors (403, etc.)
      return handleOtherErrors(owner, repo, errorMsg);
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
 * Recursively fetches directory contents up to the specified depth
 */
async function fetchDirectoryContentsRecursively(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string> = new Set()
): Promise<GitHubApiFileItem[]> {
  // Prevent infinite loops and respect depth limits
  if (currentDepth > maxDepth || visitedPaths.has(path)) {
    return [];
  }

  visitedPaths.add(path);

  try {
    const apiPath = path
      ? `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      : `/repos/${owner}/${repo}/contents?ref=${branch}`;

    const result = await executeGitHubCommand('api', [apiPath], {
      cache: false,
    });

    if (result.isError) {
      return [];
    }

    const execResult = JSON.parse(result.content[0].text as string);
    const apiItems = execResult.result;
    const items = Array.isArray(apiItems) ? apiItems : [apiItems];

    const allItems: GitHubApiFileItem[] = [...items];

    // If we haven't reached max depth, recursively fetch subdirectories
    if (currentDepth < maxDepth) {
      const directories = items.filter(item => item.type === 'dir');

      // Limit concurrent requests to avoid rate limits
      const concurrencyLimit = 3;
      for (let i = 0; i < directories.length; i += concurrencyLimit) {
        const batch = directories.slice(i, i + concurrencyLimit);

        const promises = batch.map(async dir => {
          const dirPath = dir.path;
          try {
            const subItems = await fetchDirectoryContentsRecursively(
              owner,
              repo,
              branch,
              dirPath,
              currentDepth + 1,
              maxDepth,
              new Set(visitedPaths) // Pass a copy to avoid shared state issues
            );
            return subItems;
          } catch (error) {
            // Silently fail on individual directory errors
            return [];
          }
        });

        const results = await Promise.all(promises);
        results.forEach(subItems => {
          allItems.push(...subItems);
        });
      }
    }

    return allItems;
  } catch (error) {
    // Return empty array on error to allow partial results
    return [];
  }
}

/**
 * Format the repository structure response with depth support
 */
async function formatRepositoryStructureWithDepth(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  rootItems: GitHubApiFileItem[],
  depth: number,
  includeIgnored: boolean = false,
  showMedia: boolean = false
): Promise<CallToolResult> {
  // If depth is 1, use the original simple formatting
  if (depth === 1) {
    return formatRepositoryStructure(
      owner,
      repo,
      branch,
      path,
      rootItems,
      includeIgnored,
      showMedia
    );
  }

  // For depth > 1, fetch recursive contents
  const allItems = await fetchDirectoryContentsRecursively(
    owner,
    repo,
    branch,
    path,
    1,
    depth
  );

  // Combine root items with recursive items
  const combinedItems = [...rootItems, ...allItems];

  // Remove duplicates based on path
  const uniqueItems = combinedItems.filter(
    (item, index, array) => array.findIndex(i => i.path === item.path) === index
  );

  // Apply filtering if not including ignored files
  let filteredItems = uniqueItems;
  if (!includeIgnored) {
    filteredItems = filterItems(uniqueItems, showMedia);
  }

  // Limit total items for performance (increase limit for deeper structures)
  const itemLimit = Math.min(200, 50 * depth);
  const limitedItems = filteredItems.slice(0, itemLimit);

  // Sort: directories first, then by depth (shorter paths first), then alphabetically
  limitedItems.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }

    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;

    if (aDepth !== bDepth) {
      return aDepth - bDepth;
    }

    return a.path.localeCompare(b.path);
  });

  // Create tree structure organized by depth
  const structureByDepth: {
    [depth: number]: {
      files: { name: string; path: string; size?: number; depth: number }[];
      folders: { name: string; path: string; depth: number }[];
    };
  } = {};

  limitedItems.forEach(item => {
    const itemDepth = item.path.split('/').length;
    const rootDepth = path ? path.split('/').length : 0;
    const relativeDepth = itemDepth - rootDepth;

    if (!structureByDepth[relativeDepth]) {
      structureByDepth[relativeDepth] = { files: [], folders: [] };
    }

    const itemData = {
      name: item.name,
      path: item.path,
      size: item.type === 'file' ? item.size : undefined,
      depth: relativeDepth,
    };

    if (item.type === 'file') {
      structureByDepth[relativeDepth].files.push(itemData);
    } else {
      structureByDepth[relativeDepth].folders.push(itemData);
    }
  });

  // Create simplified, token-efficient structure
  const files = limitedItems
    .filter(item => item.type === 'file')
    .map(item => ({
      name: item.name,
      path: item.path,
      size: item.size,
      depth: item.path.split('/').length - (path ? path.split('/').length : 0),
      url: item.path, // Use path for fetching
    }));

  const folders = limitedItems
    .filter(item => item.type === 'dir')
    .map(item => ({
      name: item.name,
      path: item.path,
      depth: item.path.split('/').length - (path ? path.split('/').length : 0),
      url: item.path, // Use path for browsing
    }));

  return createResult({
    data: {
      repository: `${owner}/${repo}`,
      branch: branch,
      path: path || '/',
      depth: depth,
      maxDepth: depth,
      githubBasePath: `https://api.github.com/repos/${owner}/${repo}/contents/`,
      summary: {
        totalFiles: files.length,
        totalFolders: folders.length,
        depthsExplored: Object.keys(structureByDepth)
          .map(Number)
          .sort((a, b) => a - b),
        truncated: uniqueItems.length > limitedItems.length,
        filtered: !includeIgnored,
        originalCount: includeIgnored ? undefined : uniqueItems.length,
      },
      files: {
        count: files.length,
        files: files,
      },
      folders: {
        count: folders.length,
        folders: folders,
      },
      // Include depth-organized view for better understanding
      byDepth: structureByDepth,
    },
  });
}

/**
 * Format the repository structure response
 */
function formatRepositoryStructure(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  items: GitHubApiFileItem[],
  includeIgnored: boolean = false,
  showMedia: boolean = false
): CallToolResult {
  // Apply filtering if not including ignored files
  let filteredItems = items;
  if (!includeIgnored) {
    filteredItems = filterItems(items, showMedia);
  }

  // Limit total items to 100 for efficiency
  const limitedItems = filteredItems.slice(0, 100);

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
      branch: branch,
      path: path || '/',
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
}

/**
 * Handle repository not found errors
 */
function handleRepositoryNotFound(
  owner: string,
  repo: string,
  errorMsg: string
): CallToolResult {
  if (errorMsg.includes('404')) {
    return createResult({
      error: `Repository "${owner}/${repo}" not found. It might have been deleted, renamed, or made private. Use github_search_code to find current location.`,
    });
  } else if (errorMsg.includes('403')) {
    return createResult({
      error: `Repository "${owner}/${repo}" exists but access is denied. Repository might be private or archived. Use api_status_check to verify permissions.`,
    });
  }
  return createResult({
    error: `Failed to access repository "${owner}/${repo}": ${errorMsg}. Verify repository exists and is accessible.`,
  });
}

/**
 * Handle path not found errors with helpful suggestions
 */
function handlePathNotFound(
  owner: string,
  repo: string,
  path: string,
  triedBranches: string[],
  defaultBranch: string,
  repoDefaultBranchFound: boolean
): CallToolResult {
  const defaultBranchInfo = repoDefaultBranchFound
    ? `\nRepository default branch: "${defaultBranch}"`
    : `\nCould not determine default branch - repository info unavailable`;

  if (path) {
    return createResult({
      error: `Path "${path}" not found in any branch (tried: ${triedBranches.join(', ')}).${defaultBranchInfo}

Quick solution: Use the correct branch name:
{"owner": "${owner}", "repo": "${repo}", "branch": "${defaultBranch}", "path": "${path}"}

Alternative solutions:
• Search for path: github_search_code with query="path:${path}" owner="${owner}"
• Search for directory: github_search_code with query="${path.split('/').pop()}" owner="${owner}"
• Check root structure: github_view_repo_structure with {"owner": "${owner}", "repo": "${repo}", "branch": "${defaultBranch}", "path": ""}`,
    });
  } else {
    return createResult({
      error: `Repository "${owner}/${repo}" structure not accessible in any branch (tried: ${triedBranches.join(', ')}).${defaultBranchInfo}

Repository might be empty, private, or you might not have sufficient permissions.

Alternative solutions:
• Verify permissions: api_status_check
• Search accessible repos: github_search_code with owner="${owner}"
• Try different branch: github_view_repo_structure with {"owner": "${owner}", "repo": "${repo}", "branch": "${defaultBranch}", "path": ""}`,
    });
  }
}

/**
 * Handle other types of errors (403, rate limits, etc.)
 */
function handleOtherErrors(
  owner: string,
  repo: string,
  errorMsg: string
): CallToolResult {
  if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
    return createResult({
      error: `Access denied to "${owner}/${repo}". Repository exists but might be private/archived. Use api_status_check to verify permissions, or github_search_code with owner="${owner}" to find accessible repositories.`,
    });
  } else {
    return createResult({
      error: `Failed to access "${owner}/${repo}": ${errorMsg}. Check network connection and repository permissions.`,
    });
  }
}
