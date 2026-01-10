/**
 * Token Storage Utility
 *
 * Re-exports credential storage from octocode-shared package.
 * This file is kept for backward compatibility with existing imports.
 *
 * ALL token management logic is centralized in octocode-shared.
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

  // Token refresh (centralized in shared)
  refreshAuthToken,
  type RefreshResult,

  // Token retrieval with auto-refresh
  getTokenWithRefresh,
  type TokenWithRefreshResult,

  // Utility
  getCredentialsFilePath,

  // Environment variable support
  getTokenFromEnv,
  getEnvTokenSource,
  hasEnvToken,
  ENV_TOKEN_VARS,

  // Full token resolution (recommended)
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,

  // Errors
  TimeoutError,

  // Testing utilities
  _setSecureStorageAvailable,
  _resetSecureStorageState,
} from 'octocode-shared';
