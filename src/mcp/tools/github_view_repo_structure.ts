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
import {
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  ToolOptions,
} from './utils/toolConstants';
import { generateSmartHints } from './utils/toolRelationships';
import { viewGitHubRepositoryStructureAPI } from '../../utils/githubAPI';

export { GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME };

const DESCRIPTION = `Explore GitHub repository structure with smart filtering and branch validation.
Output a list of files and folders in a repository at a specific path for smarter research.

Use with ${GITHUB_SEARCH_CODE_TOOL_NAME} and ${GITHUB_GET_FILE_CONTENT_TOOL_NAME} for detailed analysis.

BEST PRACTICES: Start with depth=1, use search for unknown paths, avoid deep exploration.`;

export function registerViewRepositoryStructureTool(
  server: McpServer,
  opts: ToolOptions = { githubAPIType: 'both', npmEnabled: false }
) {
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
          .describe('Repository owner or organization name'),

        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
          .describe('Repository name only'),

        branch: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
          .describe('Branch name'),

        path: z
          .string()
          .optional()
          .default('')
          .refine(path => !path.includes('..'), 'Path traversal not allowed')
          .refine(path => path.length <= 500, 'Path too long')
          .describe(
            'Directory path within repository. Start empty for root for exploration'
          ),

        depth: z
          .number()
          .int()
          .min(1, 'Depth must be at least 1')
          .max(2, 'Maximum depth is 2 to avoid excessive API calls')
          .optional()
          .default(1)
          .describe(
            'Directory depth to explore. Default 1 (preferred). Max 2. Use sparingly.'
          ),

        includeIgnored: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include config files, lock files, hidden directories. Default false for optimization'
          ),

        showMedia: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include media files. Default false for optimization'),
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
        const result = await viewRepositoryStructure(args, opts);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
          hasResults: false,
          errorMessage: `Failed to explore repository: ${errorMessage}`,
          customHints: ['Verify repository exists and is accessible'],
        });
        return createResult({
          isError: true,
          hints,
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
  params: GitHubRepositoryStructureParams,
  opts: ToolOptions = { githubAPIType: 'both', npmEnabled: false }
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure', params);

  return withCache(cacheKey, async () => {
    try {
      // Execute searches based on apiType option
      let cliResult: CallToolResult | null = null;
      let apiResult: CallToolResult | null = null;

      if (opts.apiType === 'gh' || opts.apiType === 'both') {
        // Execute CLI search
        cliResult = await viewRepositoryStructureCLI(params);
      }

      if (opts.apiType === 'octokit' || opts.apiType === 'both') {
        // Execute API search
        apiResult = await viewGitHubRepositoryStructureAPI(
          params,
          opts.ghToken
        );
      }

      // Return successful result, preferring CLI if both are available
      if (cliResult && !cliResult.isError) {
        return cliResult;
      } else if (apiResult && !apiResult.isError) {
        return apiResult;
      }

      // If both failed, return the CLI error (more detailed) or API error
      if (cliResult && cliResult.isError) {
        return cliResult;
      } else if (apiResult && apiResult.isError) {
        return apiResult;
      }

      // Fallback error
      return createResult({
        isError: true,
        hints: [
          `Failed to access repository "${params.owner}/${params.repo}" via both CLI and API`,
        ],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
        hasResults: false,
        errorMessage: `Failed to access repository "${params.owner}/${params.repo}": ${errorMessage}`,
        customHints: [
          'Verify repository name, permissions, and network connection',
        ],
      });
      return createResult({
        isError: true,
        hints,
      });
    }
  });
}

/**
 * Views the structure of a GitHub repository using CLI (original implementation)
 */
async function viewRepositoryStructureCLI(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const {
    owner,
    repo,
    branch,
    path = '',
    depth = 1,
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
        const repoData = JSON.parse(repoCheckResult.content[0].text as string);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Failed to access repository "${owner}/${repo}": ${errorMessage}`,
      customHints: [
        'Verify repository name, permissions, and network connection',
      ],
    });
    return createResult({
      isError: true,
      hints,
    });
  }
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

  const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
    hasResults: true,
    totalItems: files.length + folders.length,
    customHints:
      uniqueItems.length > limitedItems.length
        ? ['Results truncated for performance']
        : [],
  });

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
    hints,
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

  const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
    hasResults: true,
    totalItems: files.length + folders.length,
    customHints:
      filteredItems.length < items.length
        ? ['Some files filtered for relevance']
        : [],
  });

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
    hints,
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
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Repository "${owner}/${repo}" not found`,
      customHints: [
        'Repository might have been deleted, renamed, or made private',
      ],
    });
    return createResult({
      isError: true,
      hints,
    });
  } else if (errorMsg.includes('403')) {
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Repository "${owner}/${repo}" access denied`,
      customHints: ['Repository might be private or archived'],
    });
    return createResult({
      isError: true,
      hints,
    });
  }
  const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
    hasResults: false,
    errorMessage: `Failed to access repository "${owner}/${repo}": ${errorMsg}`,
    customHints: ['Verify repository exists and is accessible'],
  });
  return createResult({
    isError: true,
    hints,
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
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Path "${path}" not found in any branch`,
      customHints: [
        `Tried branches: ${triedBranches.join(', ')}${defaultBranchInfo}`,
        `Try correct branch: {"owner": "${owner}", "repo": "${repo}", "branch": "${defaultBranch}", "path": "${path}"}`,
        `Search for path: use github_search_code with query="path:${path}" owner="${owner}"`,
      ],
    });
    return createResult({
      isError: true,
      hints,
    });
  } else {
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Repository "${owner}/${repo}" not accessible`,
      customHints: [
        `Tried branches: ${triedBranches.join(', ')}`,
        `May be empty, private, or insufficient permissions`,
        `Try branch "${defaultBranch}"`,
      ],
    });
    return createResult({
      isError: true,
      hints,
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
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Access denied to "${owner}/${repo}"`,
      customHints: [
        'Repository exists but might be private/archived',
        `Try github_search_code with owner="${owner}" to find accessible repositories`,
      ],
    });
    return createResult({
      isError: true,
      hints,
    });
  } else {
    const hints = generateSmartHints(GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME, {
      hasResults: false,
      errorMessage: `Failed to access "${owner}/${repo}": ${errorMsg}`,
      customHints: ['Check network connection and repository permissions'],
    });
    return createResult({
      isError: true,
      hints,
    });
  }
}
