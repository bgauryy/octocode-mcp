/**
 * Credentials utilities
 *
 * Re-exports from octocode-shared package for credential management.
 */

// Re-export credential functions from shared package
export {
  // Main token resolution (includes all fallbacks: env → keychain → file)
  resolveToken,
  type ResolvedToken,

  // Legacy: stored token only (keychain/file, no env vars)
  getToken as getOctocodeToken,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from 'octocode-shared';
