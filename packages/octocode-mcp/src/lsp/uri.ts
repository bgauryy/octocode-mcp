/**
 * URI conversion utilities for LSP
 * Handles file path <-> file:// URI conversion
 * @module lsp/uri
 */

import * as path from 'path';
import { URI } from 'vscode-uri';

/**
 * Convert a file path to a file:// URI using proper encoding.
 * Handles Windows paths, UNC paths, and special characters correctly.
 *
 * @param filePath - Absolute or relative file path
 * @returns Properly encoded file:// URI
 *
 * @example
 * toUri('/users/me/file.ts')           // 'file:///users/me/file.ts'
 * toUri('C:\\Users\\me\\file.ts')      // 'file:///c%3A/Users/me/file.ts'
 * toUri('/path/with spaces/file#1.ts') // 'file:///path/with%20spaces/file%231.ts'
 */
export function toUri(filePath: string): string {
  // Already a URI - return as-is
  if (filePath.startsWith('file://')) {
    return filePath;
  }

  // Resolve to absolute path and convert to URI
  const absolutePath = path.resolve(filePath);
  return URI.file(absolutePath).toString();
}

/**
 * Convert a file:// URI back to a filesystem path.
 * Returns platform-specific path (forward slashes on Unix, backslashes on Windows).
 *
 * @param uri - A file:// URI string
 * @returns Platform-specific filesystem path
 *
 * @example
 * fromUri('file:///users/me/file.ts')           // '/users/me/file.ts'
 * fromUri('file:///c%3A/Users/me/file.ts')      // 'C:\Users\me\file.ts' (Windows)
 * fromUri('file:///path/with%20spaces/file.ts') // '/path/with spaces/file.ts'
 */
export function fromUri(uri: string): string {
  // Not a file URI - return as-is
  if (!uri.startsWith('file://')) {
    return uri;
  }

  // Parse and return filesystem path
  return URI.parse(uri).fsPath;
}
