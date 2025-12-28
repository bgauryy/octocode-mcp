/**
 * Unified Test Helpers - Central Export
 *
 * This module provides a comprehensive set of test utilities for mocking
 * file system operations, command execution, and path validation.
 *
 * ## Quick Start (Recommended Pattern)
 *
 * For local tool tests, use the pattern from `vitest-fs-mocks.ts`:
 *
 * ```typescript
 * import { vi, describe, it, expect, beforeEach } from 'vitest';
 *
 * // Create mocks with vi.hoisted (must be BEFORE vi.mock calls)
 * const { fsMocks, execMocks, pathValidatorMocks, mocks, helpers } = vi.hoisted(() => {
 *   // ... see vitest-fs-mocks.ts for full pattern
 * });
 *
 * vi.mock('fs', () => fsMocks);
 * vi.mock('../../src/utils/exec/index.js', () => execMocks);
 * vi.mock('../../src/security/pathValidator.js', () => pathValidatorMocks);
 * ```
 *
 * ## Alternative: Use Pre-built Utilities
 *
 * For non-hoisted scenarios or utility functions:
 *
 * ```typescript
 * import {
 *   createVirtualFileSystem,
 *   createExecMock,
 *   fixtures
 * } from '../helpers';
 * ```
 */

// Virtual file system utilities
export {
  createVirtualFileSystem,
  createFsStats,
  createSimpleTree,
  type VirtualFileSystem,
  type VirtualEntry,
  type VirtualFile,
  type VirtualDirectory,
} from './fsMock.js';

// Path validator mock utilities
export {
  createPathValidatorMock,
  createPermissivePathValidatorMock,
  createWorkspacePathValidatorMock,
  createPathValidatorImpl,
  applyPathValidatorMock,
  PathValidatorMockBuilder,
  type PathValidatorMock,
} from './pathValidatorMock.js';

// Exec mock utilities
export {
  createExecMock,
  createPermissiveExecMock,
  applyExecMock,
  createLsResponse,
  createRipgrepResponse,
  createFindResponse,
  ExecMockBuilder,
  type ExecMock,
  type ExecMockResult,
} from './execMock.js';

// Test fixtures
export {
  fixtures,
  fileContents,
  fileTrees,
  queries,
  type TestFixtures,
} from './fixtures.js';

// Local tool setup (legacy - see vitest-fs-mocks.ts for recommended pattern)
export {
  setupLocalToolMocks,
  createLocalToolMocks,
  type LocalToolMocksOptions,
  type LocalToolMocks,
} from './localToolSetup.js';

// Vitest-native mock template (reference)
export { createMocksForHoisting, MOCK_TEMPLATE } from './vitest-fs-mocks.js';
