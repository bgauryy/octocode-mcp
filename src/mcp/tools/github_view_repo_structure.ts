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

const DESCRIPTION = `Explore GitHub repository structure and validate repository access.

PROJECT UNDERSTANDING:
- Try to understand more by the structure of the project and the files in the project
- Identify key directories and file patterns
- fetch important files for better understanding

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

        return formatRepositoryStructure(owner, repo, branch, cleanPath, items);
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

            return formatRepositoryStructure(
              owner,
              repo,
              defaultBranch,
              cleanPath,
              items
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

            return formatRepositoryStructure(
              owner,
              repo,
              tryBranch,
              cleanPath,
              items
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
 * Format the repository structure response
 */
function formatRepositoryStructure(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  items: GitHubApiFileItem[]
): CallToolResult {
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
