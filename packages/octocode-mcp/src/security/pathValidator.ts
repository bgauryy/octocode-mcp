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
import os from 'os';
import type { PathValidationResult } from '../utils/core/types.js';
import { shouldIgnore } from './ignoredPathFilter.js';
import { redactPath } from '../errors/pathUtils.js';
import { resolveWorkspaceRoot } from './workspaceRoot.js';
import { getOctocodeDir } from 'octocode-shared';

/**
 * PathValidator configuration options
 */
interface PathValidatorOptions {
  /** Primary workspace root directory. Defaults to CWD. */
  workspaceRoot?: string;
  /** Additional allowed root directories */
  additionalRoots?: string[];
  /** Include home directory as allowed root (default: true for local tools) */
  includeHomeDir?: boolean;
}

/**
 * PathValidator class for validating and sanitizing file system paths
 */
export class PathValidator {
  private allowedRoots: string[];

  /**
   * Creates a new PathValidator
   * @param options - Configuration options (or legacy string for workspace root)
   */
  constructor(options?: string | PathValidatorOptions) {
    // Support legacy string argument
    const opts: PathValidatorOptions =
      typeof options === 'string' ? { workspaceRoot: options } : options || {};

    const root = this.expandTilde(resolveWorkspaceRoot(opts.workspaceRoot));

    this.allowedRoots = [path.resolve(root)];

    // Add home directory by default (can be disabled with includeHomeDir: false)
    if (opts.includeHomeDir !== false) {
      const homeDir = os.homedir();
      if (homeDir && !this.allowedRoots.includes(homeDir)) {
        this.allowedRoots.push(homeDir);
      }
    }

    // Always add octocode home dir (~/.octocode) so local/LSP tools
    // can access cloned repos under ~/.octocode/repos/
    try {
      const octocodeHome = path.resolve(getOctocodeDir());
      if (!this.allowedRoots.includes(octocodeHome)) {
        this.allowedRoots.push(octocodeHome);
      }
    } catch {
      // getOctocodeDir unavailable, skip
    }

    // Add additional roots from options
    if (opts.additionalRoots) {
      for (const additionalRoot of opts.additionalRoots) {
        this.addAllowedRoot(additionalRoot);
      }
    }

    // Add roots from ALLOWED_PATHS environment variable (comma-separated)
    // or from global config local.allowedPaths
    const envPaths = process.env.ALLOWED_PATHS;
    if (envPaths) {
      const paths = envPaths
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      for (const envPath of paths) {
        this.addAllowedRoot(envPath);
      }
    } else {
      try {
        const configPaths = getConfigSync().local.allowedPaths;
        if (configPaths) {
          for (const configPath of configPaths) {
            this.addAllowedRoot(configPath);
          }
        }
      } catch {
        // Config not loaded yet, skip
      }
    }
  }

  /**
   * Expands ~ to home directory
   */
  private expandTilde(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
  }

  /**
   * Adds an allowed root directory
   */
  addAllowedRoot(root: string): void {
    const expandedRoot = this.expandTilde(root);
    const resolvedRoot = path.resolve(expandedRoot);
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

    const expandedPath = this.expandTilde(inputPath);
    const absolutePath = path.resolve(expandedPath);

    const isAllowed = this.allowedRoots.some(root => {
      if (absolutePath === root) {
        return true;
      }
      return absolutePath.startsWith(root + path.sep);
    });

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Path '${redactPath(inputPath)}' is outside allowed directories`,
      };
    }

    if (shouldIgnore(absolutePath)) {
      return {
        isValid: false,
        error: `Path '${redactPath(inputPath)}' is in an ignored directory or matches an ignored pattern`,
      };
    }

    try {
      const realPath = fs.realpathSync(absolutePath);
      const isRealPathAllowed = this.allowedRoots.some(root => {
        return realPath === root || realPath.startsWith(root + path.sep);
      });

      if (!isRealPathAllowed) {
        return {
          isValid: false,
          error: `Symlink target '${redactPath(realPath)}' is outside allowed directories`,
        };
      }

      if (shouldIgnore(realPath)) {
        return {
          isValid: false,
          error: `Symlink target '${redactPath(realPath)}' is in an ignored directory or matches an ignored pattern`,
        };
      }

      return {
        isValid: true,
        sanitizedPath: realPath,
      };
    } catch (error) {
      // Handle specific filesystem errors (ENOENT, EACCES, etc.)
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
            error: `Permission denied accessing path: ${redactPath(inputPath)}`,
          };
        }

        // Symlink loop detected - security concern
        if (nodeError.code === 'ELOOP') {
          return {
            isValid: false,
            error: `Symlink loop detected at path: ${redactPath(inputPath)}`,
          };
        }

        // Name too long - invalid path
        if (nodeError.code === 'ENAMETOOLONG') {
          return {
            isValid: false,
            error: `Path name too long: ${redactPath(inputPath)}`,
          };
        }
      }

      // Security: Fail-closed for unknown errors
      // Unknown filesystem errors could indicate security issues
      return {
        isValid: false,
        error: `Unexpected error validating path: ${redactPath(inputPath)}`,
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

  /**
   * Gets the list of currently allowed root directories (for debugging)
   */
  getAllowedRoots(): readonly string[] {
    return [...this.allowedRoots];
  }
}

/**
 * Global path validator instance
 * Includes home directory by default for convenient local tool access
 */
export const pathValidator = new PathValidator();

/**
 * Reinitialize the global path validator with custom options
 * Useful for testing or runtime reconfiguration
 */
export function reinitializePathValidator(
  options?: PathValidatorOptions
): PathValidator {
  const newValidator = new PathValidator(options);
  // Copy allowed roots to the singleton (mutate in place)
  (pathValidator as unknown as { allowedRoots: string[] }).allowedRoots =
    newValidator.getAllowedRoots() as string[];
  return pathValidator;
}
