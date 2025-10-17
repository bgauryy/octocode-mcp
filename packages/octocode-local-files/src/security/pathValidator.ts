/**
 * Path validation for security - prevents path traversal attacks
 */

import path from 'path';
import fs from 'fs';
import type { ValidationResult } from '../types.js';
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
   */
  validate(inputPath: string): ValidationResult {
    if (!inputPath || inputPath.trim() === '') {
      return {
        isValid: false,
        error: 'Path cannot be empty',
      };
    }

    // Resolve to absolute path
    const absolutePath = path.resolve(inputPath);

    // Check if path is within allowed roots
    const isAllowed = this.allowedRoots.some((root) =>
      absolutePath.startsWith(root)
    );

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Path '${inputPath}' is outside allowed directories. Allowed roots: ${this.allowedRoots.join(', ')}`,
      };
    }

    // Check if path should be ignored (node_modules, .git, .env, etc.)
    if (shouldIgnore(absolutePath)) {
      return {
        isValid: false,
        error: `Path '${inputPath}' is in an ignored directory or matches an ignored pattern`,
      };
    }

    // Check for symlink traversal if path exists
    try {
      if (fs.existsSync(absolutePath)) {
        const realPath = fs.realpathSync(absolutePath);
        const isRealPathAllowed = this.allowedRoots.some((root) =>
          realPath.startsWith(root)
        );

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
      }
    } catch (error) {
      // Path doesn't exist yet or can't be resolved - that's okay for some operations
      // We'll still allow it if it's within the allowed roots
    }

    return {
      isValid: true,
      sanitizedPath: absolutePath,
    };
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
