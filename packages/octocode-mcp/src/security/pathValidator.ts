/**
 * Path validation for security - prevents path traversal attacks
 *
 * SYMLINK BEHAVIOR:
 * ==================
 * This validator has TWO different behaviors for symlinks:
 *
 * 1. PATH VALIDATION (Security - Always Resolves):
 *    - Symlinks are ALWAYS resolved to their real paths using fs.realpathSync()
 *    - The real path is then validated against allowed roots
 *    - This prevents symlink-based path traversal attacks
 *    - Example: /workspace/link -> /etc/passwd would be blocked
 *    - Cannot be disabled (security requirement)
 *
 * 2. TOOL TRAVERSAL (Performance - Configurable):
 *    - By default, tools DON'T follow symlinks during directory traversal
 *    - Use followSymlinks=true in tool options to enable
 *    - This matches ripgrep and find default behavior
 *    - Performance: Following symlinks can significantly slow down searches
 *    - Safety: May cause infinite loops with circular symlinks
 *
 * RATIONALE:
 * - Security validation must resolve symlinks to prevent attacks
 * - Tool traversal defaults to NOT following for performance
 * - Users can opt-in to symlink following per operation
 * - Symlink targets are still validated (must be within workspace)
 *
 * CONSTANTS:
 * - SECURITY_DEFAULTS.VALIDATE_SYMLINK_TARGETS = true (always)
 * - SECURITY_DEFAULTS.DEFAULT_FOLLOW_SYMLINKS = false (tool default)
 */

import path from 'path';
import fs from 'fs';
import type { PathValidationResult } from '../utils/types.js';
import { shouldIgnore } from './ignoredPathFilter.js';

/**
 * PathValidator class for validating and sanitizing file system paths
 */
export class PathValidator {
  private allowedRoots: string[];

  /**
   * Creates a new PathValidator
   * @param workspaceRoot - Optional workspace root directory. Defaults to current working directory.
   */
  constructor(workspaceRoot?: string) {
    this.allowedRoots = workspaceRoot
      ? [path.resolve(workspaceRoot)]
      : [process.cwd()];
  }

  /**
   * Adds an allowed root directory
   */
  addAllowedRoot(root: string): void {
    const resolvedRoot = path.resolve(root);
    if (!this.allowedRoots.includes(resolvedRoot)) {
      this.allowedRoots.push(resolvedRoot);
    }
  }

  /**
   * Validates a path to ensure it's within allowed directories
   *
   * SECURITY NOTE: This method ALWAYS resolves symlinks to their real paths
   * before validation. This prevents symlink-based path traversal attacks.
   * This behavior cannot be disabled as it's a core security requirement.
   *
   * @param inputPath - The path to validate
   */
  validate(inputPath: string): PathValidationResult {
    if (!inputPath || inputPath.trim() === '') {
      return {
        isValid: false,
        error: 'Path cannot be empty',
      };
    }

    // Resolve relative paths to absolute paths relative to workspace root
    // This ensures relative paths like './src' resolve correctly
    let absolutePath: string;
    if (path.isAbsolute(inputPath)) {
      // Already absolute, just normalize
      absolutePath = path.resolve(inputPath);
    } else {
      // Resolve relative path from workspace root (first allowed root)
      const workspaceRoot = this.allowedRoots[0] || process.cwd();
      absolutePath = path.resolve(workspaceRoot, inputPath);
    }

    // Check if path is within allowed roots
    // Must be the root itself OR start with root + path separator
    const isAllowed = this.allowedRoots.some(root => {
      // Exact match
      if (absolutePath === root) {
        return true;
      }
      // Must start with root + separator to ensure it's truly a child path
      return absolutePath.startsWith(root + path.sep);
    });

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Path '${inputPath}' is outside allowed directories. Allowed roots: ${this.allowedRoots.join(', ')}`,
      };
    }

    // Check if path should be ignored (.git, .env, etc.)
    if (shouldIgnore(absolutePath)) {
      return {
        isValid: false,
        error: `Path '${inputPath}' is in an ignored directory or matches an ignored pattern`,
      };
    }

    // Check for symlink traversal by resolving real path in a single step
    try {
      const realPath = fs.realpathSync(absolutePath);
      const isRealPathAllowed = this.allowedRoots.some(root => {
        // Exact match or starts with root + separator
        return realPath === root || realPath.startsWith(root + path.sep);
      });

      if (!isRealPathAllowed) {
        return {
          isValid: false,
          error: `Symlink target '${realPath}' is outside allowed directories`,
        };
      }

      // Check if resolved symlink target should be ignored
      if (shouldIgnore(realPath)) {
        return {
          isValid: false,
          error: `Symlink target '${realPath}' is in an ignored directory or matches an ignored pattern`,
        };
      }

      return {
        isValid: true,
        sanitizedPath: realPath,
      };
    } catch (error) {
      // Comprehensive error handling for different failure modes
      if (error instanceof Error) {
        const nodeError = error as Error & { code?: string };

        // Path doesn't exist yet - allow if within allowed roots
        if (nodeError.code === 'ENOENT') {
          return {
            isValid: true,
            sanitizedPath: absolutePath,
          };
        }

        // Permission denied - explicit rejection
        if (nodeError.code === 'EACCES') {
          return {
            isValid: false,
            error: `Permission denied accessing path: ${inputPath}`,
          };
        }

        // Symlink loop detected - security concern
        if (nodeError.code === 'ELOOP') {
          return {
            isValid: false,
            error: `Symlink loop detected at path: ${inputPath}`,
          };
        }

        // Name too long - invalid path
        if (nodeError.code === 'ENAMETOOLONG') {
          return {
            isValid: false,
            error: `Path name too long: ${inputPath}`,
          };
        }
      }

      // For unknown errors, allow if within workspace (fail-open for usability)
      // but log for debugging in development
      return {
        isValid: true,
        sanitizedPath: absolutePath,
      };
    }
  }

  /**
   * Checks if a path exists and is accessible
   */
  async exists(inputPath: string): Promise<boolean> {
    const validation = this.validate(inputPath);
    if (!validation.isValid || !validation.sanitizedPath) {
      return false;
    }

    try {
      await fs.promises.access(validation.sanitizedPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the type of a path (file, directory, symlink)
   */
  async getType(
    inputPath: string
  ): Promise<'file' | 'directory' | 'symlink' | null> {
    const validation = this.validate(inputPath);
    if (!validation.isValid || !validation.sanitizedPath) {
      return null;
    }

    try {
      const stats = await fs.promises.lstat(validation.sanitizedPath);
      if (stats.isFile()) return 'file';
      if (stats.isDirectory()) return 'directory';
      if (stats.isSymbolicLink()) return 'symlink';
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Global path validator instance
 */
export const pathValidator = new PathValidator();
