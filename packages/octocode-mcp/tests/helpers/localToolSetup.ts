/**
 * Unified Local Tool Test Setup
 *
 * This module provides a single setup function that properly initializes all
 * mocks needed for testing local file system tools. It handles the vitest
 * hoisting requirements correctly and provides a clean API.
 *
 * ## IMPORTANT: Usage Pattern
 *
 * Because vitest hoists vi.mock() calls, you MUST follow this pattern:
 *
 * ```typescript
 * // Step 1: Import helpers
 * import { vi, describe, it, expect, beforeEach } from 'vitest';
 * import {
 *   createLocalToolMocks,
 *   createVirtualFileSystem,
 *   createExecMock,
 *   fixtures
 * } from '../helpers';
 *
 * // Step 2: Create mock functions BEFORE vi.mock (using vi.hoisted)
 * const mocks = vi.hoisted(() => createLocalToolMocks());
 *
 * // Step 3: Apply mocks
 * vi.mock('fs', () => mocks.fsMock);
 * vi.mock('../../src/utils/local/utils/exec.js', () => mocks.execMock);
 * vi.mock('../../src/security/pathValidator.js', () => mocks.pathValidatorMock);
 *
 * // Step 4: Import the module under test AFTER mocks
 * const { viewStructure } = await import('../../src/tools/local_view_structure.js');
 *
 * describe('localViewStructure', () => {
 *   beforeEach(() => {
 *     mocks.reset();
 *     // Configure for this test
 *     mocks.vfs = createVirtualFileSystem(fixtures.trees.simpleProject);
 *     mocks.applyVfs();
 *   });
 *
 *   it('should list directory', async () => {
 *     mocks.exec.onLs().returnsLines(['file1.ts', 'file2.ts']);
 *     const result = await viewStructure({ path: '/workspace' });
 *     expect(result.status).toBe('hasResults');
 *   });
 * });
 * ```
 */

import { vi } from 'vitest';
import type { Dirent } from 'fs';
import {
  createVirtualFileSystem,
  createFsStats,
  type VirtualFileSystem,
  type VirtualFileSystemTree,
} from './fsMock.js';
import {
  createPathValidatorMock,
  createWorkspacePathValidatorMock,
  type PathValidatorMock,
} from './pathValidatorMock.js';
import { createExecMock, ExecMockBuilder } from './execMock.js';

/**
 * Options for local tool mock setup
 */
export interface LocalToolMocksOptions {
  /** Workspace root path (default: '/workspace') */
  workspaceRoot?: string;
  /** Initial virtual file system tree */
  initialTree?: VirtualFileSystemTree;
  /** Whether to auto-configure path validator for workspace */
  configurePathValidator?: boolean;
}

/**
 * Local tool mocks interface
 */
export interface LocalToolMocks {
  // Mock modules for vi.mock()
  fsMock: FsMockModule;
  execMock: ExecMockModule;
  pathValidatorMock: PathValidatorMockModule;

  // Mutable state for test configuration
  vfs: VirtualFileSystem;
  exec: ExecMockBuilder;
  pathValidator: PathValidatorMock;

  // Configuration helpers
  reset: () => void;
  applyVfs: () => void;
  setVfs: (tree: VirtualFileSystemTree) => void;
  configureExec: (fn: (builder: ExecMockBuilder) => void) => void;
}

/**
 * Type for fs mock module structure
 */
interface FsMockModule {
  default: {
    lstatSync: ReturnType<typeof vi.fn>;
    realpathSync: ReturnType<typeof vi.fn>;
    promises: {
      readdir: ReturnType<typeof vi.fn>;
      lstat: ReturnType<typeof vi.fn>;
      stat: ReturnType<typeof vi.fn>;
      readFile: ReturnType<typeof vi.fn>;
      access: ReturnType<typeof vi.fn>;
    };
  };
  lstatSync: ReturnType<typeof vi.fn>;
  realpathSync: ReturnType<typeof vi.fn>;
  promises: {
    readdir: ReturnType<typeof vi.fn>;
    lstat: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    access: ReturnType<typeof vi.fn>;
  };
}

/**
 * Type for exec mock module structure
 */
interface ExecMockModule {
  safeExec: ReturnType<typeof vi.fn>;
}

/**
 * Type for path validator mock module structure
 */
interface PathValidatorMockModule {
  pathValidator: {
    validate: ReturnType<typeof vi.fn>;
  };
}

/**
 * Create all mocks needed for local tool testing
 *
 * This function must be called inside vi.hoisted() to work correctly.
 *
 * @example
 * ```typescript
 * const mocks = vi.hoisted(() => createLocalToolMocks());
 * ```
 */
export function createLocalToolMocks(
  options: LocalToolMocksOptions = {}
): LocalToolMocks {
  const {
    workspaceRoot = '/workspace',
    initialTree = {
      [workspaceRoot]: { type: 'directory', children: {} },
    } as VirtualFileSystemTree,
    configurePathValidator = true,
  } = options;

  // Create mock functions
  const lstatSyncFn = vi.fn();
  const realpathSyncFn = vi.fn();
  const readdirFn = vi.fn();
  const lstatFn = vi.fn();
  const statFn = vi.fn();
  const readFileFn = vi.fn();
  const accessFn = vi.fn();
  const safeExecFn = vi.fn();
  const validateFn = vi.fn();

  // Create fs mock module structure
  const fsMock: FsMockModule = {
    default: {
      lstatSync: lstatSyncFn,
      realpathSync: realpathSyncFn,
      promises: {
        readdir: readdirFn,
        lstat: lstatFn,
        stat: statFn,
        readFile: readFileFn,
        access: accessFn,
      },
    },
    lstatSync: lstatSyncFn,
    realpathSync: realpathSyncFn,
    promises: {
      readdir: readdirFn,
      lstat: lstatFn,
      stat: statFn,
      readFile: readFileFn,
      access: accessFn,
    },
  };

  // Create exec mock module structure
  const execMock: ExecMockModule = {
    safeExec: safeExecFn,
  };

  // Create path validator mock module structure
  const pathValidatorMock: PathValidatorMockModule = {
    pathValidator: {
      validate: validateFn,
    },
  };

  // Mutable state
  let vfs = createVirtualFileSystem(initialTree);
  let execBuilder = createExecMock();
  let pvMock = configurePathValidator
    ? createWorkspacePathValidatorMock(workspaceRoot)
    : createPathValidatorMock().setDefault('allow').build();

  // Apply VFS to mock functions
  const applyVfs = () => {
    // Apply lstat
    lstatFn.mockImplementation(async (p: string) => vfs.lstat(p));
    lstatSyncFn.mockImplementation((p: string) => vfs.lstatSync(p));

    // Apply stat
    statFn.mockImplementation(async (p: string) => vfs.stat(p));

    // Apply readdir - handle both simple and withFileTypes options
    readdirFn.mockImplementation(
      async (
        p: string,
        options?: { withFileTypes?: boolean }
      ): Promise<string[] | Dirent[]> => {
        if (options?.withFileTypes) {
          return vfs.readdirWithTypes(p);
        }
        return vfs.readdir(p);
      }
    );

    // Apply readFile
    readFileFn.mockImplementation(async (p: string) => vfs.readFile(p));

    // Apply access
    accessFn.mockImplementation(async (p: string) => vfs.access(p));

    // Apply realpath
    realpathSyncFn.mockImplementation((p: string) => vfs.realpathSync(p));
  };

  // Apply path validator
  const applyPathValidator = () => {
    validateFn.mockImplementation(pvMock.validate);
  };

  // Apply exec
  const applyExec = () => {
    const builtExec = execBuilder.build();
    safeExecFn.mockImplementation(builtExec.exec);
  };

  // Reset all mocks to default state
  const reset = () => {
    // Clear mock call history
    lstatSyncFn.mockClear();
    realpathSyncFn.mockClear();
    readdirFn.mockClear();
    lstatFn.mockClear();
    statFn.mockClear();
    readFileFn.mockClear();
    accessFn.mockClear();
    safeExecFn.mockClear();
    validateFn.mockClear();

    // Reset to initial state
    vfs = createVirtualFileSystem(initialTree);
    execBuilder = createExecMock();
    pvMock = configurePathValidator
      ? createWorkspacePathValidatorMock(workspaceRoot)
      : createPathValidatorMock().setDefault('allow').build();

    // Apply defaults
    applyVfs();
    applyPathValidator();
    applyExec();
  };

  // Initialize with defaults
  applyVfs();
  applyPathValidator();

  // Set default exec behavior
  safeExecFn.mockResolvedValue({
    success: true,
    code: 0,
    stdout: '',
    stderr: '',
  });

  return {
    fsMock,
    execMock,
    pathValidatorMock,

    get vfs() {
      return vfs;
    },
    set vfs(newVfs: VirtualFileSystem) {
      vfs = newVfs;
      applyVfs();
    },

    get exec() {
      return execBuilder;
    },
    set exec(builder: ExecMockBuilder) {
      execBuilder = builder;
      applyExec();
    },

    get pathValidator() {
      return pvMock;
    },
    set pathValidator(mock: PathValidatorMock) {
      pvMock = mock;
      applyPathValidator();
    },

    reset,
    applyVfs,
    setVfs: (tree: VirtualFileSystemTree) => {
      vfs = createVirtualFileSystem(tree);
      applyVfs();
    },
    configureExec: (fn: (builder: ExecMockBuilder) => void) => {
      fn(execBuilder);
      applyExec();
    },
  };
}

/**
 * Setup function for legacy compatibility
 * Returns mocks that can be used with existing test patterns
 *
 * @deprecated Use createLocalToolMocks() with vi.hoisted() instead
 */
export function setupLocalToolMocks(
  options: LocalToolMocksOptions = {}
): LocalToolMocks {
  return createLocalToolMocks(options);
}

// Re-export for convenience
export { createFsStats };
