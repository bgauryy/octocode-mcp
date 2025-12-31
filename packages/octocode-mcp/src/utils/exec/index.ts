/**
 * Exec utilities - consolidated command execution module
 *
 * Provides four categories of command execution:
 * - spawn: Core spawn functionality with timeout and output handling
 * - npm: npm/gh CLI utilities with security validation
 * - safe: Security-validated execution for local filesystem operations
 * - availability: Command availability checking for required CLI tools
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

// Command availability checking
export {
  checkCommandAvailability,
  checkAllCommandsAvailability,
  getMissingCommandError,
  clearAvailabilityCache,
  REQUIRED_COMMANDS,
  type CommandName,
  type CommandAvailabilityResult,
} from './commandAvailability.js';
