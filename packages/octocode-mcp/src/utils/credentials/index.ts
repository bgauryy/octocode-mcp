/**
 * Credentials utilities
 *
 * Re-exports from octocode-shared package for credential management.
 */

// Re-export credential functions from shared package
export {
  // Env token source detection (for source tracking)
  getEnvTokenSource,

  // Stored token only (keychain/file, no env vars) - used by tests
  getToken as getOctocodeToken,

  // Full token resolution with gh CLI fallback (recommended for MCP)
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from 'octocode-shared';
