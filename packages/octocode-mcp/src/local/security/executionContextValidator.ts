/**
 * Execution context validation for security - prevents command execution outside workspace
 */

import path from 'path';
import fs from 'fs';
import type { ValidationResult } from '../types.js';

/**
 * Gets the workspace root directory
 * Uses WORKSPACE_ROOT environment variable if set, otherwise falls back to process.cwd()
 */
function getWorkspaceRoot(workspaceRoot?: string): string {
  if (workspaceRoot) {
    return path.resolve(workspaceRoot);
  }

  // Check for WORKSPACE_ROOT environment variable
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  // Default to current working directory
  return process.cwd();
}

/**
 * Validates that a command execution context (cwd) is within the workspace directory
 * Prevents commands from being executed in parent directories or arbitrary filesystem locations
 *
 * @param cwd - The current working directory where the command will execute
 * @param workspaceRoot - Optional workspace root override
 * @returns ValidationResult indicating if the execution context is safe
 */
export function validateExecutionContext(
  cwd: string | undefined,
  workspaceRoot?: string
): ValidationResult {
  const workspace = getWorkspaceRoot(workspaceRoot);

  // If cwd is undefined, it will default to the current process.cwd() in spawn()
  // which is safe since the process itself is running in the workspace
  if (cwd === undefined) {
    return { isValid: true };
  }

  // Empty string is not a valid cwd
  if (cwd.trim() === '') {
    return {
      isValid: false,
      error: 'Execution context (cwd) cannot be empty',
    };
  }

  // Resolve to absolute path
  const absoluteCwd = path.resolve(cwd);

  // Check if cwd is within workspace
  if (!absoluteCwd.startsWith(workspace)) {
    return {
      isValid: false,
      error: `Can only execute commands within workspace directory: ${workspace}. Attempted execution in: ${absoluteCwd}`,
    };
  }

  try {
    // If path exists, resolve and validate symlink target
    fs.lstatSync(absoluteCwd);
    const realPath = fs.realpathSync(absoluteCwd);

    // Verify the real path is still within workspace
    if (!realPath.startsWith(workspace)) {
      return {
        isValid: false,
        error: `Symlink target '${realPath}' is outside workspace directory: ${workspace}`,
      };
    }
  } catch (error) {
    // If path doesn't exist yet, allow within workspace
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
    // Otherwise, reject with detailed message
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
