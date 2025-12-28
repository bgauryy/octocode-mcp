/**
 * Exec utilities - consolidated command execution module
 *
 * Provides three categories of command execution:
 * - spawn: Core spawn functionality with timeout and output handling
 * - npm: npm/gh CLI utilities with security validation
 * - safe: Security-validated execution for local filesystem operations
 */

// Core spawn functionality
export {
  spawnWithTimeout,
  spawnCheckSuccess,
  spawnCollectStdout,
  validateArgs,
  type SpawnWithTimeoutOptions,
  type SpawnResult,
} from './spawn.js';

// npm/gh CLI utilities
export {
  getGithubCLIToken,
  checkNpmAvailability,
  executeNpmCommand,
} from './npm.js';

// Safe execution with security validation
export { safeExec } from './safe.js';
