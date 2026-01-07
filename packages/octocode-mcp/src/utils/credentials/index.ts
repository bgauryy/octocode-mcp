/**
 * Credentials utilities
 *
 * Re-exports from octocode-shared package for credential management.
 */

// Re-export credential functions from shared package
export {
  // Main token retrieval function
  getToken as getOctocodeToken,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from 'octocode-shared';
