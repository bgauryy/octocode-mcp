import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import {
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
} from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, path: requestedPath = '' } = params;
    const directoryListing: string[] = [];
    let apiResponse: any = null;
    let actualBranch = branch;

    // Define branch fallback order
    const branchFallbacks = [branch, 'main', 'master', 'develop', 'trunk'];

    try {
      // Construct the path segment
      const pathSegment = requestedPath.startsWith('/')
        ? requestedPath.substring(1)
        : requestedPath;

      // Try each branch in the fallback order
      let lastError: Error | null = null;
      let success = false;

      for (const tryBranch of branchFallbacks) {
        try {
          const apiPath = `repos/${owner}/${repo}/contents/${pathSegment}?ref=${tryBranch}`;
          const args = [apiPath];
          const result = await executeGitHubCommand('api', args, {
            cache: false,
          });

          if (result.isError) {
            throw new Error(result.content[0].text as string);
          }

          // Extract the actual content from the exec result
          const execResult = JSON.parse(result.content[0].text as string);
          const items = JSON.parse(execResult.result);

          // If we get here, the request succeeded
          apiResponse = items;
          actualBranch = tryBranch;
          success = true;

          // Populate directoryListing with names of items at the current path
          if (Array.isArray(items)) {
            for (const item of items) {
              let itemName = item.name;
              if (item.type === 'dir') {
                itemName += '/';
              }
              directoryListing.push(itemName);
            }
          } else if (items) {
            // Handle single file case (though unusual for structure view)
            if (items.name) {
              directoryListing.push(
                items.type === 'dir' ? `${items.name}/` : items.name
              );
            }
          }

          break; // Success, exit the loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is not a 404 error (branch not found), or if it's the last attempt, break
          const errorMessage = lastError.message.toLowerCase();
          if (
            !errorMessage.includes('no commit found') &&
            !errorMessage.includes('404') &&
            !errorMessage.includes('not found')
          ) {
            // This is a different kind of error (permissions, network, etc.), don't continue fallback
            break;
          }

          // Continue to next branch fallback
          continue;
        }
      }

      if (!success) {
        // All branch attempts failed
        const attemptedBranches = branchFallbacks.join(', ');
        throw new Error(
          `Failed to access repository structure. Tried branches: ${attemptedBranches}. ` +
            `Last error: ${lastError?.message || 'Unknown error'}`
        );
      }

      directoryListing.sort(); // Sort for consistent output

      const result: GitHubRepositoryStructureResult = {
        owner,
        repo,
        branch: actualBranch, // Include the branch that actually worked
        structure: directoryListing,
        rawOutput: apiResponse,
        // Add metadata about branch fallback if different from requested
        ...(actualBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: actualBranch,
            message: `Branch '${branch}' not found, used '${actualBranch}' instead`,
          },
        }),
      };

      return createSuccessResult(result);
    } catch (error) {
      // Final error handling with comprehensive error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Failed to view GitHub repository structure for ${owner}/${repo} at path '${requestedPath}': ${errorMessage}`,
        error
      );
    }
  });
}
