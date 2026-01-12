/**
 * Security validation for LSP server binary paths
 * Prevents path traversal and validates binary existence
 * @module lsp/validation
 */

import { realpathSync, statSync } from 'fs';
import * as path from 'path';

/**
 * Result of LSP server path validation
 */
export interface ValidationResult {
  /** Whether the path is valid and safe to execute */
  isValid: boolean;
  /** Resolved absolute path (if valid) */
  resolvedPath?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Validates that an LSP server binary path is safe to execute.
 *
 * Security checks:
 * 1. Path must exist
 * 2. Path must be a regular file (not a directory or dangling symlink)
 * 3. Path traversal patterns are blocked
 * 4. Symlinks are resolved and their targets validated
 *
 * @param binPath - The resolved binary path to validate
 * @param baseDir - The base directory the path should be relative to
 * @returns ValidationResult with isValid flag and error message if invalid
 *
 * @example
 * const result = validateLSPServerPath('./bin/server', '/usr/local/lib');
 * if (!result.isValid) {
 *   console.error(result.error);
 * }
 */
export function validateLSPServerPath(
  binPath: string,
  baseDir: string
): ValidationResult {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(binPath)
    ? binPath
    : path.resolve(baseDir, binPath);

  // Check for path traversal attempt (relative path escaping base directory)
  if (!path.isAbsolute(binPath)) {
    // Normalize and check if it stays within baseDir
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(baseDir)) {
      return {
        isValid: false,
        error: `LSP server path escapes base directory: ${binPath}`,
      };
    }
  }

  // Resolve symlinks to get real path
  let realPath: string;
  try {
    realPath = realpathSync(absolutePath);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === 'ENOENT') {
      return {
        isValid: false,
        error: `LSP server binary not found: ${absolutePath}`,
      };
    }
    if (nodeError.code === 'ELOOP') {
      return {
        isValid: false,
        error: `Symlink loop detected in LSP server path: ${absolutePath}`,
      };
    }
    return {
      isValid: false,
      error: `Cannot resolve LSP server path: ${absolutePath}`,
    };
  }

  // Verify it's a file (not a directory)
  try {
    const stats = statSync(realPath);
    if (!stats.isFile()) {
      return {
        isValid: false,
        error: `LSP server path is not a file: ${realPath}`,
      };
    }
  } catch {
    return {
      isValid: false,
      error: `Cannot stat LSP server binary: ${realPath}`,
    };
  }

  return { isValid: true, resolvedPath: realPath };
}
