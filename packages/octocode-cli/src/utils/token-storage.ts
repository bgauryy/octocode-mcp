/**
 * Token Storage Utility
 *
 * Re-exports credential storage from octocode-shared package.
 * This file is kept for backward compatibility with existing imports.
 */

// Re-export from the shared package
export {
  // Initialization
  initializeSecureStorage,
  isSecureStorageAvailable,
  isUsingSecureStorage,

  // CRUD operations
  storeCredentials,
  getCredentials,
  getCredentialsSync,
  deleteCredentials,
  updateToken,

  // List/check operations
  listStoredHosts,
  listStoredHostsSync,
  hasCredentials,
  hasCredentialsSync,

  // Token expiration checks
  isTokenExpired,
  isRefreshTokenExpired,

  // Utility
  getCredentialsFilePath,

  // Errors
  TimeoutError,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from 'octocode-shared';
