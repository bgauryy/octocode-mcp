/**
 * Vitest-Native File System Mocks
 *
 * This module provides mock factories that work correctly with vitest's hoisting.
 * The key insight is that vi.hoisted() runs BEFORE imports, so we can only use
 * vitest's built-in vi.fn() inside it.
 *
 * ## Usage Pattern
 *
 * ```typescript
 * import { vi, describe, it, expect, beforeEach } from 'vitest';
 *
 * // Step 1: Create mock functions with vi.hoisted (NO external imports!)
 * const { fsMocks, execMocks, pathValidatorMocks, helpers } = vi.hoisted(() => {
 *   // Create all mock functions
 *   const lstatSync = vi.fn();
 *   const realpathSync = vi.fn();
 *   const readdir = vi.fn();
 *   const lstat = vi.fn();
 *   const stat = vi.fn();
 *   const readFile = vi.fn();
 *   const access = vi.fn();
 *   const safeExec = vi.fn();
 *   const validate = vi.fn();
 *
 *   return {
 *     fsMocks: {
 *       default: {
 *         lstatSync,
 *         realpathSync,
 *         promises: { readdir, lstat, stat, readFile, access },
 *       },
 *       lstatSync,
 *       realpathSync,
 *       promises: { readdir, lstat, stat, readFile, access },
 *     },
 *     execMocks: { safeExec },
 *     pathValidatorMocks: { pathValidator: { validate } },
 *     helpers: {
 *       // Helper to create Stats object
 *       createStats: (opts = {}) => ({
 *         isFile: () => opts.isFile ?? true,
 *         isDirectory: () => opts.isDir ?? false,
 *         isSymbolicLink: () => opts.isSymlink ?? false,
 *         size: opts.size ?? 0,
 *         mtime: opts.mtime ?? new Date(),
 *       }),
 *       // Reset all mocks
 *       reset: () => {
 *         [lstatSync, realpathSync, readdir, lstat, stat, readFile, access, safeExec, validate]
 *           .forEach(fn => fn.mockClear());
 *       },
 *       // Quick setup for valid path
 *       setupValidPath: (path = '/test/path') => {
 *         validate.mockReturnValue({ isValid: true, sanitizedPath: path });
 *       },
 *       // Quick setup for exec success
 *       setupExecSuccess: (stdout = '') => {
 *         safeExec.mockResolvedValue({ success: true, code: 0, stdout, stderr: '' });
 *       },
 *     },
 *   };
 * });
 *
 * // Step 2: Apply mocks
 * vi.mock('fs', () => fsMocks);
 * vi.mock('../../src/utils/local/utils/exec.js', () => execMocks);
 * vi.mock('../../src/security/pathValidator.js', () => pathValidatorMocks);
 *
 * // Step 3: Import module under test
 * const { viewStructure } = await import('../../src/tools/local_view_structure.js');
 *
 * describe('test', () => {
 *   beforeEach(() => {
 *     helpers.reset();
 *     helpers.setupValidPath();
 *     helpers.setupExecSuccess();
 *   });
 *
 *   it('works', async () => {
 *     const result = await viewStructure({ path: '/test/path' });
 *     expect(result.status).toBe('empty');
 *   });
 * });
 * ```
 */

import { vi } from 'vitest';
import type { Stats, Dirent } from 'fs';

/**
 * Create the complete mock structure for local tool testing.
 *
 * IMPORTANT: This function must be called inside vi.hoisted().
 * Do NOT import this function - copy the pattern into your test file.
 *
 * This is exported only for documentation purposes.
 */
export function createMocksForHoisting() {
  // Create all mock functions
  const lstatSync = vi.fn();
  const realpathSync = vi.fn();
  const readdir = vi.fn();
  const lstat = vi.fn();
  const stat = vi.fn();
  const readFile = vi.fn();
  const access = vi.fn();
  const safeExec = vi.fn();
  const validate = vi.fn();

  // Stats factory (can be used inside vi.hoisted)
  const createStats = (
    opts: {
      isFile?: boolean;
      isDir?: boolean;
      isSymlink?: boolean;
      size?: number;
      mtime?: Date;
    } = {}
  ): Partial<Stats> => ({
    isFile: () => opts.isFile ?? (!opts.isDir && !opts.isSymlink),
    isDirectory: () => opts.isDir ?? false,
    isSymbolicLink: () => opts.isSymlink ?? false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    size: opts.size ?? 0,
    mtime: opts.mtime ?? new Date(),
    mode: 0o644,
  });

  // Dirent factory
  const createDirent = (
    name: string,
    type: 'file' | 'directory' | 'symlink' = 'file'
  ): Partial<Dirent> => ({
    name,
    isFile: () => type === 'file',
    isDirectory: () => type === 'directory',
    isSymbolicLink: () => type === 'symlink',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  });

  return {
    // Mock module structures (use with vi.mock)
    fsMocks: {
      default: {
        lstatSync,
        realpathSync,
        promises: { readdir, lstat, stat, readFile, access },
      },
      lstatSync,
      realpathSync,
      promises: { readdir, lstat, stat, readFile, access },
    },
    execMocks: { safeExec },
    pathValidatorMocks: { pathValidator: { validate } },

    // Individual mock references (for direct manipulation)
    mocks: {
      lstatSync,
      realpathSync,
      readdir,
      lstat,
      stat,
      readFile,
      access,
      safeExec,
      validate,
    },

    // Factory functions
    createStats,
    createDirent,

    // Helper functions
    helpers: {
      /** Reset all mock call history */
      reset: () => {
        [
          lstatSync,
          realpathSync,
          readdir,
          lstat,
          stat,
          readFile,
          access,
          safeExec,
          validate,
        ].forEach(fn => fn.mockClear());
      },

      /** Setup valid path validation */
      setupValidPath: (path = '/test/path') => {
        validate.mockReturnValue({ isValid: true, sanitizedPath: path });
      },

      /** Setup invalid path validation */
      setupInvalidPath: (error = 'Path not allowed') => {
        validate.mockReturnValue({ isValid: false, error });
      },

      /** Setup exec to return success */
      setupExecSuccess: (stdout = '', stderr = '') => {
        safeExec.mockResolvedValue({
          success: true,
          code: 0,
          stdout,
          stderr,
        });
      },

      /** Setup exec to return failure */
      setupExecFailure: (stderr = 'Command failed', code = 1) => {
        safeExec.mockResolvedValue({
          success: false,
          code,
          stdout: '',
          stderr,
        });
      },

      /** Setup lstat to return file stats */
      setupLstatFile: (size = 1024, mtime = new Date()) => {
        const stats = createStats({ isFile: true, size, mtime });
        lstat.mockResolvedValue(stats);
        lstatSync.mockReturnValue(stats);
        stat.mockResolvedValue(stats);
      },

      /** Setup lstat to return directory stats */
      setupLstatDir: (mtime = new Date()) => {
        const stats = createStats({ isDir: true, mtime });
        lstat.mockResolvedValue(stats);
        lstatSync.mockReturnValue(stats);
        stat.mockResolvedValue(stats);
      },

      /** Setup readdir to return file list */
      setupReaddir: (
        files: Array<
          string | { name: string; type: 'file' | 'directory' | 'symlink' }
        >
      ) => {
        // Simple string array
        const names = files.map(f => (typeof f === 'string' ? f : f.name));
        readdir.mockImplementation(
          async (_path: string, opts?: { withFileTypes?: boolean }) => {
            if (opts?.withFileTypes) {
              return files.map(f =>
                typeof f === 'string'
                  ? createDirent(f, 'file')
                  : createDirent(f.name, f.type)
              );
            }
            return names;
          }
        );
      },

      /** Setup readFile to return content */
      setupReadFile: (content: string) => {
        readFile.mockResolvedValue(content);
      },

      /** Setup realpath to return resolved path */
      setupRealpath: (resolvedPath: string) => {
        realpathSync.mockReturnValue(resolvedPath);
      },

      /** Setup access to succeed */
      setupAccessOk: () => {
        access.mockResolvedValue(undefined);
      },

      /** Setup access to fail */
      setupAccessDenied: () => {
        const error = new Error('EACCES: permission denied') as Error & {
          code: string;
        };
        error.code = 'EACCES';
        access.mockRejectedValue(error);
      },

      /** Setup lstat to throw ENOENT */
      setupFileNotFound: () => {
        const error = new Error(
          'ENOENT: no such file or directory'
        ) as Error & {
          code: string;
        };
        error.code = 'ENOENT';
        lstat.mockRejectedValue(error);
        lstatSync.mockImplementation(() => {
          throw error;
        });
        stat.mockRejectedValue(error);
      },

      /** Create ls command output */
      createLsOutput: (files: string[]) => files.join('\n'),

      /** Create find command output (null-separated) */
      createFindOutput: (paths: string[]) =>
        paths.length > 0 ? paths.join('\0') + '\0' : '',

      /** Create ripgrep JSON match output */
      createRipgrepMatch: (
        path: string,
        line: number,
        text: string,
        column = 0
      ) =>
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: path },
            lines: { text },
            line_number: line,
            absolute_offset: 0,
            submatches: [
              {
                match: { text: text.trim() },
                start: column,
                end: column + text.trim().length,
              },
            ],
          },
        }),

      /** Create ripgrep summary output */
      createRipgrepSummary: (matchCount: number) =>
        JSON.stringify({
          type: 'summary',
          data: {
            elapsed_total: { human: '0.001s' },
            stats: {
              elapsed: { human: '0.001s' },
              searches: 1,
              searches_with_match: matchCount > 0 ? 1 : 0,
              bytes_searched: 1000,
              bytes_printed: 100,
              matched_lines: matchCount,
              matches: matchCount,
            },
          },
        }),
    },
  };
}

/**
 * Template code to copy into your test file.
 *
 * Copy this into your test file and modify as needed:
 */
export const MOCK_TEMPLATE = `
// ============================================================================
// COPY THIS INTO YOUR TEST FILE
// ============================================================================

// Step 1: Create mocks with vi.hoisted (NO IMPORTS ALLOWED HERE!)
const { fsMocks, execMocks, pathValidatorMocks, mocks, createStats, helpers } = vi.hoisted(() => {
  const lstatSync = vi.fn();
  const realpathSync = vi.fn();
  const readdir = vi.fn();
  const lstat = vi.fn();
  const stat = vi.fn();
  const readFile = vi.fn();
  const access = vi.fn();
  const safeExec = vi.fn();
  const validate = vi.fn();

  const createStats = (opts = {}) => ({
    isFile: () => opts.isFile ?? (!opts.isDir && !opts.isSymlink),
    isDirectory: () => opts.isDir ?? false,
    isSymbolicLink: () => opts.isSymlink ?? false,
    size: opts.size ?? 0,
    mtime: opts.mtime ?? new Date(),
  });

  return {
    fsMocks: {
      default: {
        lstatSync,
        realpathSync,
        promises: { readdir, lstat, stat, readFile, access },
      },
      lstatSync,
      realpathSync,
      promises: { readdir, lstat, stat, readFile, access },
    },
    execMocks: { safeExec },
    pathValidatorMocks: { pathValidator: { validate } },
    mocks: { lstatSync, realpathSync, readdir, lstat, stat, readFile, access, safeExec, validate },
    createStats,
    helpers: {
      reset: () => [lstatSync, realpathSync, readdir, lstat, stat, readFile, access, safeExec, validate].forEach(fn => fn.mockClear()),
      setupValidPath: (path = '/test/path') => validate.mockReturnValue({ isValid: true, sanitizedPath: path }),
      setupExecSuccess: (stdout = '') => safeExec.mockResolvedValue({ success: true, code: 0, stdout, stderr: '' }),
    },
  };
});

// Step 2: Apply mocks
vi.mock('fs', () => fsMocks);
vi.mock('../../src/utils/local/utils/exec.js', () => execMocks);
vi.mock('../../src/security/pathValidator.js', () => pathValidatorMocks);

// Step 3: Import module under test
const { viewStructure } = await import('../../src/tools/local_view_structure.js');

// Step 4: Write tests
describe('my test', () => {
  beforeEach(() => {
    helpers.reset();
    helpers.setupValidPath('/workspace');
    helpers.setupExecSuccess();
  });

  it('works', async () => {
    const result = await viewStructure({ path: '/workspace' });
    expect(result).toBeDefined();
  });
});
`;
