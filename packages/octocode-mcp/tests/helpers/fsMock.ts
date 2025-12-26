/**
 * Virtual File System Mock for Testing
 *
 * Provides a type-safe, in-memory file system for testing file operations
 * without touching the real file system.
 *
 * @example
 * ```typescript
 * const vfs = createVirtualFileSystem({
 *   '/workspace': {
 *     type: 'directory',
 *     children: {
 *       'src': {
 *         type: 'directory',
 *         children: {
 *           'index.ts': { type: 'file', content: 'export {}', size: 10 }
 *         }
 *       },
 *       'package.json': { type: 'file', content: '{}', size: 2 }
 *     }
 *   }
 * });
 *
 * // Use in tests
 * vi.mocked(fs.promises.readdir).mockImplementation(vfs.readdir);
 * vi.mocked(fs.promises.lstat).mockImplementation(vfs.lstat);
 * ```
 */

import { vi } from 'vitest';
import type { Stats, Dirent } from 'fs';
import path from 'path';

/**
 * Type alias for Node.js error with code property
 */
type ErrnoException = Error & { code?: string };

/**
 * Virtual file entry
 */
export interface VirtualFile {
  type: 'file';
  content?: string;
  size?: number;
  mtime?: Date;
  mode?: number;
}

/**
 * Virtual directory entry
 */
export interface VirtualDirectory {
  type: 'directory';
  children?: Record<string, VirtualEntry>;
  mtime?: Date;
  mode?: number;
}

/**
 * Virtual symlink entry
 */
export interface VirtualSymlink {
  type: 'symlink';
  target: string;
  mtime?: Date;
}

/**
 * Any virtual entry type
 */
export type VirtualEntry = VirtualFile | VirtualDirectory | VirtualSymlink;

/**
 * Virtual file system tree definition
 */
export type VirtualFileSystemTree = Record<string, VirtualEntry>;

/**
 * Stats creation options
 */
export interface StatsOptions {
  size?: number;
  mtime?: Date;
  mode?: number;
  isDir?: boolean;
  isFile?: boolean;
  isSymlink?: boolean;
}

/**
 * Create a mock Stats object
 */
export function createFsStats(options: StatsOptions = {}): Stats {
  const {
    size = 0,
    mtime = new Date(),
    mode = 0o644,
    isDir = false,
    isFile = !isDir,
    isSymlink = false,
  } = options;

  return {
    isFile: () => isFile && !isDir && !isSymlink,
    isDirectory: () => isDir,
    isSymbolicLink: () => isSymlink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    size,
    mtime,
    mode,
    atime: mtime,
    ctime: mtime,
    birthtime: mtime,
    atimeMs: mtime.getTime(),
    mtimeMs: mtime.getTime(),
    ctimeMs: mtime.getTime(),
    birthtimeMs: mtime.getTime(),
    dev: 0,
    ino: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 4096,
    blocks: Math.ceil(size / 512),
  } as Stats;
}

/**
 * Create a mock Dirent object
 */
function createDirent(name: string, entry: VirtualEntry): Dirent {
  return {
    name,
    isFile: () => entry.type === 'file',
    isDirectory: () => entry.type === 'directory',
    isSymbolicLink: () => entry.type === 'symlink',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '',
    path: '',
  } as Dirent;
}

/**
 * Virtual file system interface
 */
export interface VirtualFileSystem {
  /** Get entry at path */
  getEntry(filePath: string): VirtualEntry | undefined;

  /** Check if path exists */
  exists(filePath: string): boolean;

  /** Mock implementation for fs.promises.lstat */
  lstat(filePath: string | Buffer | URL): Promise<Stats>;

  /** Mock implementation for fs.lstatSync */
  lstatSync(filePath: string | Buffer | URL): Stats;

  /** Mock implementation for fs.promises.stat */
  stat(filePath: string | Buffer | URL): Promise<Stats>;

  /** Mock implementation for fs.promises.readdir */
  readdir(dirPath: string | Buffer | URL): Promise<string[]>;

  /** Mock implementation for fs.promises.readdir with withFileTypes */
  readdirWithTypes(dirPath: string | Buffer | URL): Promise<Dirent[]>;

  /** Mock implementation for fs.promises.readFile */
  readFile(filePath: string | Buffer | URL, encoding?: string): Promise<string>;

  /** Mock implementation for fs.promises.access */
  access(filePath: string | Buffer | URL): Promise<void>;

  /** Mock implementation for fs.realpathSync */
  realpathSync(filePath: string | Buffer | URL): string;

  /** Add an entry to the virtual file system */
  addEntry(filePath: string, entry: VirtualEntry): void;

  /** Remove an entry from the virtual file system */
  removeEntry(filePath: string): boolean;

  /** Get the raw tree */
  getTree(): VirtualFileSystemTree;

  /** Apply all mocks to vitest mocked fs module */
  applyMocks(mockFs: MockedFs): void;
}

/**
 * Type for mocked fs module
 */
interface MockedFs {
  default?: {
    promises?: {
      lstat?: ReturnType<typeof vi.fn>;
      stat?: ReturnType<typeof vi.fn>;
      readdir?: ReturnType<typeof vi.fn>;
      readFile?: ReturnType<typeof vi.fn>;
      access?: ReturnType<typeof vi.fn>;
    };
    lstatSync?: ReturnType<typeof vi.fn>;
    realpathSync?: ReturnType<typeof vi.fn>;
  };
  promises?: {
    lstat?: ReturnType<typeof vi.fn>;
    stat?: ReturnType<typeof vi.fn>;
    readdir?: ReturnType<typeof vi.fn>;
    readFile?: ReturnType<typeof vi.fn>;
    access?: ReturnType<typeof vi.fn>;
  };
  lstatSync?: ReturnType<typeof vi.fn>;
  realpathSync?: ReturnType<typeof vi.fn>;
}

/**
 * Create a virtual file system for testing
 */
export function createVirtualFileSystem(
  tree: VirtualFileSystemTree = {}
): VirtualFileSystem {
  // Deep clone the tree to avoid mutations
  const fileTree: VirtualFileSystemTree = JSON.parse(JSON.stringify(tree));

  // Restore Date objects lost in JSON serialization
  const restoreDates = (entry: VirtualEntry): void => {
    if (entry.mtime && typeof entry.mtime === 'string') {
      entry.mtime = new Date(entry.mtime);
    }
    if (entry.type === 'directory' && entry.children) {
      Object.values(entry.children).forEach(restoreDates);
    }
  };
  Object.values(fileTree).forEach(restoreDates);

  const normalizePath = (p: string | Buffer | URL): string => {
    const str = p.toString();
    return path.normalize(str).replace(/\/+$/, '') || '/';
  };

  const getEntry = (filePath: string): VirtualEntry | undefined => {
    const normalized = normalizePath(filePath);
    const parts = normalized.split(path.sep).filter(Boolean);

    // Check root entries first
    if (parts.length === 0) return undefined;

    // Build path progressively
    let currentPath = '';
    let current: VirtualEntry | undefined;

    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? path.join(currentPath, parts[i]!) : parts[i]!;

      if (i === 0) {
        // Try absolute path first
        current = fileTree[`/${currentPath}`] ?? fileTree[currentPath];
        if (!current) {
          // Try finding as child of root
          const rootEntry = Object.values(fileTree).find(
            (e): e is VirtualDirectory =>
              e.type === 'directory' && e.children !== undefined
          );
          if (rootEntry?.children) {
            current = rootEntry.children[parts[i]!];
          }
        }
      } else if (current?.type === 'directory' && current.children) {
        current = current.children[parts[i]!];
      } else {
        return undefined;
      }

      if (!current) return undefined;
    }

    return current;
  };

  const vfs: VirtualFileSystem = {
    getEntry,

    exists(filePath: string): boolean {
      return getEntry(filePath) !== undefined;
    },

    async lstat(filePath: string | Buffer | URL): Promise<Stats> {
      const entry = getEntry(normalizePath(filePath));
      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, lstat '${filePath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      return createFsStats({
        isDir: entry.type === 'directory',
        isFile: entry.type === 'file',
        isSymlink: entry.type === 'symlink',
        size:
          entry.type === 'file'
            ? (entry.size ?? entry.content?.length ?? 0)
            : 0,
        mtime: entry.mtime ?? new Date(),
        mode:
          entry.type === 'file'
            ? ((entry as VirtualFile).mode ?? 0o644)
            : 0o755,
      });
    },

    lstatSync(filePath: string | Buffer | URL): Stats {
      const entry = getEntry(normalizePath(filePath));
      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, lstat '${filePath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      return createFsStats({
        isDir: entry.type === 'directory',
        isFile: entry.type === 'file',
        isSymlink: entry.type === 'symlink',
        size:
          entry.type === 'file'
            ? (entry.size ?? entry.content?.length ?? 0)
            : 0,
        mtime: entry.mtime ?? new Date(),
      });
    },

    async stat(filePath: string | Buffer | URL): Promise<Stats> {
      // For symlinks, stat follows to target (simplified - just return lstat)
      return this.lstat(filePath);
    },

    async readdir(dirPath: string | Buffer | URL): Promise<string[]> {
      const entry = getEntry(normalizePath(dirPath));
      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, readdir '${dirPath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      if (entry.type !== 'directory') {
        const error = new Error(
          `ENOTDIR: not a directory, readdir '${dirPath}'`
        ) as ErrnoException;
        error.code = 'ENOTDIR';
        throw error;
      }

      return Object.keys(entry.children || {});
    },

    async readdirWithTypes(dirPath: string | Buffer | URL): Promise<Dirent[]> {
      const entry = getEntry(normalizePath(dirPath));
      if (!entry || entry.type !== 'directory') {
        const error = new Error(
          `ENOENT: no such file or directory, readdir '${dirPath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      return Object.entries(entry.children || {}).map(([name, child]) =>
        createDirent(name, child)
      );
    },

    async readFile(
      filePath: string | Buffer | URL,
      _encoding?: string
    ): Promise<string> {
      const entry = getEntry(normalizePath(filePath));
      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      if (entry.type !== 'file') {
        const error = new Error(
          `EISDIR: illegal operation on a directory, read '${filePath}'`
        ) as ErrnoException;
        error.code = 'EISDIR';
        throw error;
      }

      return entry.content ?? '';
    },

    async access(filePath: string | Buffer | URL): Promise<void> {
      const entry = getEntry(normalizePath(filePath));
      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, access '${filePath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
    },

    realpathSync(filePath: string | Buffer | URL): string {
      const normalized = normalizePath(filePath);
      const entry = getEntry(normalized);

      if (!entry) {
        const error = new Error(
          `ENOENT: no such file or directory, realpath '${filePath}'`
        ) as ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      // For symlinks, resolve target
      if (entry.type === 'symlink') {
        return (entry as VirtualSymlink).target;
      }

      return path.resolve(normalized);
    },

    addEntry(filePath: string, entry: VirtualEntry): void {
      const normalized = normalizePath(filePath);
      fileTree[normalized] = entry;
    },

    removeEntry(filePath: string): boolean {
      const normalized = normalizePath(filePath);
      if (normalized in fileTree) {
        delete fileTree[normalized];
        return true;
      }
      return false;
    },

    getTree(): VirtualFileSystemTree {
      return fileTree;
    },

    applyMocks(mockFs: MockedFs): void {
      // Apply to default export
      if (mockFs.default?.promises) {
        mockFs.default.promises.lstat?.mockImplementation(
          this.lstat.bind(this)
        );
        mockFs.default.promises.stat?.mockImplementation(this.stat.bind(this));
        mockFs.default.promises.readdir?.mockImplementation(
          async (p: string, options?: { withFileTypes?: boolean }) => {
            if (options?.withFileTypes) {
              return this.readdirWithTypes(p);
            }
            return this.readdir(p);
          }
        );
        mockFs.default.promises.readFile?.mockImplementation(
          this.readFile.bind(this)
        );
        mockFs.default.promises.access?.mockImplementation(
          this.access.bind(this)
        );
      }
      if (mockFs.default?.lstatSync) {
        mockFs.default.lstatSync.mockImplementation(this.lstatSync.bind(this));
      }
      if (mockFs.default?.realpathSync) {
        mockFs.default.realpathSync.mockImplementation(
          this.realpathSync.bind(this)
        );
      }

      // Apply to named exports
      if (mockFs.promises) {
        mockFs.promises.lstat?.mockImplementation(this.lstat.bind(this));
        mockFs.promises.stat?.mockImplementation(this.stat.bind(this));
        mockFs.promises.readdir?.mockImplementation(
          async (p: string, options?: { withFileTypes?: boolean }) => {
            if (options?.withFileTypes) {
              return this.readdirWithTypes(p);
            }
            return this.readdir(p);
          }
        );
        mockFs.promises.readFile?.mockImplementation(this.readFile.bind(this));
        mockFs.promises.access?.mockImplementation(this.access.bind(this));
      }
      if (mockFs.lstatSync) {
        mockFs.lstatSync.mockImplementation(this.lstatSync.bind(this));
      }
      if (mockFs.realpathSync) {
        mockFs.realpathSync.mockImplementation(this.realpathSync.bind(this));
      }
    },
  };

  return vfs;
}

/**
 * Quick helper to create a simple directory structure
 *
 * @example
 * ```typescript
 * const tree = createSimpleTree('/workspace', {
 *   'src/index.ts': 'export {}',
 *   'src/utils/helper.ts': 'export const helper = () => {}',
 *   'package.json': '{"name": "test"}',
 * });
 * ```
 */
export function createSimpleTree(
  basePath: string,
  files: Record<string, string>
): VirtualFileSystemTree {
  const tree: VirtualFileSystemTree = {};

  // Create root directory
  const rootDir: VirtualDirectory = { type: 'directory', children: {} };
  tree[basePath] = rootDir;

  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.split('/').filter(Boolean);
    let current = rootDir;

    // Create directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]!;
      if (!current.children) current.children = {};
      if (!current.children[dirName]) {
        current.children[dirName] = { type: 'directory', children: {} };
      }
      current = current.children[dirName] as VirtualDirectory;
    }

    // Create file
    const fileName = parts[parts.length - 1]!;
    if (!current.children) current.children = {};
    current.children[fileName] = {
      type: 'file',
      content,
      size: content.length,
      mtime: new Date(),
    };
  }

  return tree;
}
