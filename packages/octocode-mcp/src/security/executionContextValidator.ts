/**
 * Execution context validation for security - prevents command execution outside workspace
 */

import path from 'path';
import fs from 'fs';
import type { PathValidationResult } from '../utils/core/types.js';
import { getConfigSync } from 'octocode-shared';

/**
 * Gets the workspace root directory
 * Uses WORKSPACE_ROOT environment variable if set, otherwise falls back to process.cwd()
 */
function getWorkspaceRoot(workspaceRoot?: string): string {
  if (workspaceRoot) {
    return path.resolve(workspaceRoot);
  }

  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  // Fallback to global config
  try {
    const configRoot = getConfigSync().local.workspaceRoot;
    if (configRoot) {
      return path.resolve(configRoot);
    }
  } catch {
    // Config not loaded yet, fall through
  }

  return process.cwd();
}

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
  const workspace = getWorkspaceRoot(workspaceRoot);

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

  if (
    absoluteCwd !== workspace &&
    !absoluteCwd.startsWith(workspace + path.sep)
  ) {
    return {
      isValid: false,
      error: `Can only execute commands within workspace directory: ${workspace}. Attempted execution in: ${absoluteCwd}`,
    };
  }

  try {
    fs.lstatSync(absoluteCwd);
    const realPath = fs.realpathSync(absoluteCwd);

    if (realPath !== workspace && !realPath.startsWith(workspace + path.sep)) {
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
