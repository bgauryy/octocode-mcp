/**
 * Credential Types
 *
 * Shared types for OAuth tokens and credential storage across octocode packages.
 */

/**
 * OAuth token structure
 */
export interface OAuthToken {
  token: string;
  tokenType: 'oauth';
  scopes?: string[];
  // For GitHub Apps with expiring tokens
  refreshToken?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
}

/**
 * Stored credentials for a GitHub host
 */
export interface StoredCredentials {
  hostname: string;
  username: string;
  token: OAuthToken;
  gitProtocol: 'ssh' | 'https';
  createdAt: string;
  updatedAt: string;
}

/**
 * Result from storing credentials (keyring-first strategy)
 */
export interface StoreResult {
  success: boolean;
  /** True if fallback to encrypted file was used (keyring unavailable/failed) */
  insecureStorageUsed: boolean;
}

/**
 * Result from deleting credentials
 */
export interface DeleteResult {
  success: boolean;
  deletedFromKeyring: boolean;
  deletedFromFile: boolean;
}

/**
 * Storage interface for credentials (file fallback)
 */
export interface CredentialsStore {
  version: number;
  credentials: Record<string, StoredCredentials>;
}
