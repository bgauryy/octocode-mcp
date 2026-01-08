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
  TokenSource,
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
  resolveToken,
  type ResolvedToken,

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
  ENV_TOKEN_VARS,

  // Environment variable support
  getTokenFromEnv,
  getEnvTokenSource,
  hasEnvToken,

  // Errors
  TimeoutError,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from './storage.js';
