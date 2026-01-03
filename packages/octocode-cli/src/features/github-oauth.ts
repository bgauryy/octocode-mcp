/**
 * GitHub OAuth Authentication
 *
 * Implements GitHub OAuth device flow for CLI authentication.
 * Behaves like `gh auth login` - opens browser, shows code, waits for auth.
 *
 * Features:
 * - Device code flow (no server required)
 * - Automatic browser opening
 * - Token refresh for expiring tokens
 * - Secure credential storage
 */

import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import { refreshToken, deleteToken, checkToken } from '@octokit/oauth-methods';
import { request } from '@octokit/request';
import open from 'open';
import type {
  OAuthToken,
  StoredCredentials,
  OctocodeAuthStatus,
} from '../types/index.js';
import {
  storeCredentials,
  getCredentials,
  deleteCredentials,
  isTokenExpired,
  isRefreshTokenExpired,
  updateToken,
  getCredentialsFilePath,
} from '../utils/token-storage.js';

// Default OAuth App Client ID (same as gh CLI - public client)
// You can replace this with your own OAuth App's client ID
const DEFAULT_CLIENT_ID = '178c6fc778ccc68e1d6a';

// Default scopes required for Octocode MCP
const DEFAULT_SCOPES = ['repo', 'read:org', 'gist'];

// Default hostname
const DEFAULT_HOSTNAME = 'github.com';

export interface LoginOptions {
  /** GitHub hostname (default: github.com) */
  hostname?: string;
  /** OAuth scopes to request */
  scopes?: string[];
  /** Git protocol to configure */
  gitProtocol?: 'ssh' | 'https';
  /** Custom OAuth App client ID */
  clientId?: string;
  /** Callback when verification code is ready */
  onVerification?: (verification: VerificationInfo) => void;
  /** Whether to automatically open browser */
  openBrowser?: boolean;
}

export interface VerificationInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface LoginResult {
  success: boolean;
  username?: string;
  hostname?: string;
  error?: string;
}

export interface LogoutResult {
  success: boolean;
  error?: string;
}

/**
 * Get GitHub API base URL for a hostname
 */
function getApiBaseUrl(hostname: string): string {
  if (hostname === 'github.com' || hostname === DEFAULT_HOSTNAME) {
    return 'https://api.github.com';
  }
  // GitHub Enterprise Server
  return `https://${hostname}/api/v3`;
}

/**
 * Get the current authenticated user's login
 */
async function getCurrentUser(
  token: string,
  hostname: string
): Promise<string> {
  const baseUrl = getApiBaseUrl(hostname);

  const response = await request('GET /user', {
    headers: {
      authorization: `token ${token}`,
    },
    baseUrl,
  });

  return response.data.login;
}

/**
 * Login to GitHub using OAuth device flow
 *
 * Behaves like `gh auth login`:
 * 1. Requests device code from GitHub
 * 2. Shows user code and opens browser
 * 3. Polls until user completes authentication
 * 4. Stores token securely
 */
export async function login(options: LoginOptions = {}): Promise<LoginResult> {
  const {
    hostname = DEFAULT_HOSTNAME,
    scopes = DEFAULT_SCOPES,
    gitProtocol = 'https',
    clientId = DEFAULT_CLIENT_ID,
    onVerification,
    openBrowser = true,
  } = options;

  try {
    // Create OAuth device auth
    const auth = createOAuthDeviceAuth({
      clientType: 'oauth-app',
      clientId,
      scopes,
      onVerification: async verification => {
        // Call custom handler if provided
        if (onVerification) {
          onVerification(verification as VerificationInfo);
        }

        // Open browser automatically
        if (openBrowser) {
          try {
            await open(verification.verification_uri);
          } catch {
            // Browser opening failed, user will need to open manually
          }
        }
      },
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname),
      }),
    });

    // Authenticate - this will trigger onVerification and poll for token
    const tokenAuth = await auth({ type: 'oauth' });

    // Get the authenticated user's login
    const username = await getCurrentUser(tokenAuth.token, hostname);

    // Create token object
    const token: OAuthToken = {
      token: tokenAuth.token,
      tokenType: 'oauth',
      scopes: 'scopes' in tokenAuth ? tokenAuth.scopes : undefined,
    };

    // Handle GitHub App expiring tokens
    if ('refreshToken' in tokenAuth && tokenAuth.refreshToken) {
      token.refreshToken = tokenAuth.refreshToken;
      token.expiresAt =
        'expiresAt' in tokenAuth ? (tokenAuth.expiresAt as string) : undefined;
      token.refreshTokenExpiresAt =
        'refreshTokenExpiresAt' in tokenAuth
          ? (tokenAuth.refreshTokenExpiresAt as string)
          : undefined;
    }

    // Store credentials
    const credentials: StoredCredentials = {
      hostname,
      username,
      token,
      gitProtocol,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storeCredentials(credentials);

    return {
      success: true,
      username,
      hostname,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Logout from GitHub
 *
 * Behaves like `gh auth logout`:
 * 1. Revokes token on GitHub (if possible)
 * 2. Removes stored credentials
 */
export async function logout(
  hostname: string = DEFAULT_HOSTNAME
): Promise<LogoutResult> {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return {
      success: false,
      error: `Not logged in to ${hostname}`,
    };
  }

  try {
    // Try to revoke the token on GitHub
    // This requires the client secret, which we don't have for public clients
    // So we just delete the local credentials
    await deleteToken({
      clientType: 'oauth-app',
      clientId: DEFAULT_CLIENT_ID,
      clientSecret: '', // We don't have this for public clients
      token: credentials.token.token,
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname),
      }),
    });
  } catch {
    // Token revocation may fail without client secret
    // That's okay, we'll still delete local credentials
  }

  // Delete local credentials
  deleteCredentials(hostname);

  return { success: true };
}

/**
 * Refresh an expired token
 *
 * Only works for GitHub Apps with expiring tokens enabled
 */
export async function refreshAuthToken(
  hostname: string = DEFAULT_HOSTNAME
): Promise<LoginResult> {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return {
      success: false,
      error: `Not logged in to ${hostname}`,
    };
  }

  if (!credentials.token.refreshToken) {
    return {
      success: false,
      error: 'Token does not support refresh (OAuth App tokens do not expire)',
    };
  }

  if (isRefreshTokenExpired(credentials)) {
    return {
      success: false,
      error: 'Refresh token has expired. Please login again.',
    };
  }

  try {
    const response = await refreshToken({
      clientType: 'github-app',
      clientId: DEFAULT_CLIENT_ID,
      refreshToken: credentials.token.refreshToken,
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname),
      }),
    });

    // Update stored token
    const newToken: OAuthToken = {
      token: response.authentication.token,
      tokenType: 'oauth',
      refreshToken: response.authentication.refreshToken,
      expiresAt: response.authentication.expiresAt,
      refreshTokenExpiresAt: response.authentication.refreshTokenExpiresAt,
    };

    updateToken(hostname, newToken);

    return {
      success: true,
      username: credentials.username,
      hostname,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
    };
  }
}

/**
 * Get current authentication status
 */
export function getAuthStatus(
  hostname: string = DEFAULT_HOSTNAME
): OctocodeAuthStatus {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return {
      authenticated: false,
    };
  }

  const tokenExpired = isTokenExpired(credentials);

  return {
    authenticated: !tokenExpired,
    hostname: credentials.hostname,
    username: credentials.username,
    tokenExpired,
  };
}

/**
 * Get a valid token, refreshing if necessary
 */
export async function getValidToken(
  hostname: string = DEFAULT_HOSTNAME
): Promise<string | null> {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(credentials)) {
    // Try to refresh
    if (credentials.token.refreshToken) {
      const result = await refreshAuthToken(hostname);
      if (!result.success) {
        return null;
      }
      // Get updated credentials
      const updated = getCredentials(hostname);
      return updated?.token.token || null;
    }
    return null;
  }

  return credentials.token.token;
}

/**
 * Verify the stored token is still valid by making a test API call
 */
export async function verifyToken(
  hostname: string = DEFAULT_HOSTNAME
): Promise<boolean> {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return false;
  }

  try {
    await checkToken({
      clientType: 'oauth-app',
      clientId: DEFAULT_CLIENT_ID,
      token: credentials.token.token,
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname),
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the credentials file path (for display to user)
 */
export function getStoragePath(): string {
  return getCredentialsFilePath();
}

/**
 * Check if using secure storage (keychain) vs file fallback
 * Currently we only use file storage with encryption
 */
export function isUsingSecureStorage(): boolean {
  // Future: return true if keytar is available
  return false;
}
