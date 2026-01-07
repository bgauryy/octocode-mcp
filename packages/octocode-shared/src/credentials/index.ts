/**
 * Credentials Module Exports
 */

// Types
export type {
  OAuthToken,
  StoredCredentials,
  StoreResult,
  DeleteResult,
  CredentialsStore,
} from './types.js';

// Storage functions
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

  // Token retrieval (convenience)
  getToken,
  getTokenSync,

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

  // File storage helpers (for advanced use cases)
  readCredentialsStore,
  encrypt,
  decrypt,

  // Constants
  OCTOCODE_DIR,
  CREDENTIALS_FILE,
  KEY_FILE,

  // Errors
  TimeoutError,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from './storage.js';
