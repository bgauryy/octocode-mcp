/**
 * Exec utilities - consolidated command execution module
 *
 * Re-exports from base module for convenient access
 */

export {
  spawnWithTimeout,
  spawnCheckSuccess,
  spawnCollectStdout,
  validateArgs,
  type SpawnWithTimeoutOptions,
  type SpawnResult,
} from './base.js';
