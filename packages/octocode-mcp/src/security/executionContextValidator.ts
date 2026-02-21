/**
 * Execution context validation for security - prevents command execution outside workspace
 */

import path from 'path';
import fs from 'fs';
import type { PathValidationResult } from '../utils/core/types.js';
import { resolveWorkspaceRoot } from './workspaceRoot.js';
import { getOctocodeDir } from 'octocode-shared';

/**
 * Validates that a command execution context (cwd) is within the workspace directory
 * Prevents commands from being executed in parent directories or arbitrary filesystem locations
 *
 * @param cwd - The current working directory where the command will execute
 * @param workspaceRoot - Optional workspace root override
 * @returns PathValidationResult indicating if the execution context is safe
 */
export function validateExecutionContext(
  cwd: string | undefined,
  workspaceRoot?: string
): PathValidationResult {
  const workspace = resolveWorkspaceRoot(workspaceRoot);

  if (cwd === undefined) {
    return { isValid: true };
  }

  if (cwd.trim() === '') {
    return {
      isValid: false,
      error: 'Execution context (cwd) cannot be empty',
    };
  }

  const absoluteCwd = path.resolve(cwd);

  // Build allowed roots: workspace + octocode home dir (for cloned repos)
  const allowedRoots = [workspace];
  try {
    const octocodeHome = path.resolve(getOctocodeDir());
    if (!allowedRoots.includes(octocodeHome)) {
      allowedRoots.push(octocodeHome);
    }
  } catch {
    // getOctocodeDir unavailable, skip
  }

  const isInAllowedRoot = allowedRoots.some(
    root => absoluteCwd === root || absoluteCwd.startsWith(root + path.sep)
  );

  if (!isInAllowedRoot) {
    return {
      isValid: false,
      error: `Can only execute commands within workspace directory: ${workspace}. Attempted execution in: ${absoluteCwd}`,
    };
  }

  try {
    fs.lstatSync(absoluteCwd);
    const realPath = fs.realpathSync(absoluteCwd);

    const isRealPathAllowed = allowedRoots.some(
      root => realPath === root || realPath.startsWith(root + path.sep)
    );
    if (!isRealPathAllowed) {
      return {
        isValid: false,
        error: `Symlink target '${realPath}' is outside workspace directory: ${workspace}`,
      };
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {
        isValid: true,
        sanitizedPath: absoluteCwd,
      };
    }
    return {
      isValid: false,
      error: `Cannot validate execution context: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    isValid: true,
    sanitizedPath: absoluteCwd,
  };
}
