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

  // Token retrieval with auto-refresh
  getTokenWithRefresh,

  // Utility
  getCredentialsFilePath,

  // Environment variable support
  getTokenFromEnv,
  getEnvTokenSource,
  hasEnvToken,

  // Full token resolution (recommended)
  resolveTokenFull,
} from 'octocode-shared';
