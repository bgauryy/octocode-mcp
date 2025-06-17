import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import {
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
} from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

/**
 * Views the structure of a GitHub repository at a specific path.
 *
 * This function handles the core repository structure viewing functionality, including:
 * - Branch fallback logic for compatibility
 * - Error handling for various failure scenarios
 *
 * @param params - Repository structure parameters
 * @returns Promise resolving to formatted repository structure results
 */
export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure-enhanced', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, path: requestedPath = '' } = params;
    const items: any[] = [];
    let actualBranch = branch;

    // Define branch fallback order
    const branchFallbacks = [branch, 'main', 'master', 'develop', 'trunk'];

    try {
      // Construct the path segment
      const pathSegment = requestedPath.startsWith('/')
        ? requestedPath.substring(1)
        : requestedPath;

      // First, try to verify the repository exists with the original branch
      let repositoryExists = false;
      let validBranch: string | null = null;

      // Check if repository and branch exist by trying root access
      for (const tryBranch of branchFallbacks) {
        try {
          const rootApiPath = `repos/${owner}/${repo}/contents?ref=${tryBranch}`;
          const rootResult = await executeGitHubCommand('api', [rootApiPath], {
            cache: false,
          });

          if (!rootResult.isError) {
            repositoryExists = true;
            validBranch = tryBranch;
            break;
          }
        } catch (error) {
          // Continue to next branch
          continue;
        }
      }

      if (!repositoryExists || !validBranch) {
        throw new Error(
          `Repository ${owner}/${repo} not found or no accessible branches. ` +
            `Tried branches: ${branchFallbacks.join(', ')}`
        );
      }

      // Now try to access the specific path with the valid branch
      let lastError: Error | null = null;
      let success = false;

      try {
        const apiPath = `repos/${owner}/${repo}/contents/${pathSegment}?ref=${validBranch}`;
        const args = [apiPath];
        const result = await executeGitHubCommand('api', args, {
          cache: false,
        });

        if (result.isError) {
          throw new Error(result.content[0].text as string);
        }

        // Extract the actual content from the exec result
        const execResult = JSON.parse(result.content[0].text as string);
        const apiItems = JSON.parse(execResult.result);

        actualBranch = validBranch;
        success = true;

        // Process items
        if (Array.isArray(apiItems)) {
          items.push(...apiItems);
        } else if (apiItems) {
          // Handle single file case
          items.push(apiItems);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();

        // Check if this is a path not found error (404)
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found')
        ) {
          // This is likely a path not found error, not a branch error
          if (requestedPath) {
            throw new Error(
              `Path "${requestedPath}" not found in repository ${owner}/${repo}. ` +
                `Use github_get_contents with empty path first to discover the repository structure. ` +
                `Common directories might be: packages/, src/, lib/, dist/, docs/`
            );
          } else {
            throw new Error(
              `Repository ${owner}/${repo} appears empty or inaccessible`
            );
          }
        } else {
          // Some other error (permissions, network, etc.)
          throw lastError;
        }
      }

      if (!success) {
        // This shouldn't happen given our new logic, but just in case
        throw new Error('Failed to access repository structure');
      }

      // Sort items: directories first, then alphabetically
      items.sort((a, b) => {
        // Directories first
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }

        // Alphabetical
        return a.name.localeCompare(b.name);
      });

      const result: GitHubRepositoryStructureResult = {
        owner,
        repo,
        branch: actualBranch,
        path: requestedPath,
        items,
        structure: items.map(item =>
          item.type === 'dir' ? `${item.name}/` : item.name
        ),
        ...(actualBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: actualBranch,
            message: `Used '${actualBranch}' instead of '${branch}'`,
          },
        }),
      };

      return createSuccessResult(result);
    } catch (error) {
      // Final error handling with comprehensive error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Repository access failed: ${owner}/${repo}${requestedPath ? ` at ${requestedPath}` : ''}`,
        new Error(errorMessage)
      );
    }
  });
}
