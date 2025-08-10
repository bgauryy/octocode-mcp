import { SecureCredentialStore } from '../../../security/credentialStore.js';
import { getGithubCLIToken } from '../../../utils/exec.js';
import { extractBearerToken } from '../../../utils/github/client.js';

/**
 * Token Manager
 *
 * Centralized token management for tools. Provides access to GitHub tokens
 * without storing them in tool options, improving security by reducing
 * token exposure across the application.
 */

let cachedToken: string | null = null;

/**
 * Get GitHub token for API calls
 *
 * @returns GitHub token or null if not available
 */
export async function getGitHubToken(): Promise<string | null> {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  // Try to get token from various sources
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    (await getGithubCLIToken()) ||
    extractBearerToken(process.env.Authorization ?? '');

  if (token) {
    // Cache the token for subsequent calls
    cachedToken = token;
    return token;
  }

  return null;
}

/**
 * Clear cached token (useful for testing or token refresh)
 */
export function clearCachedToken(): void {
  cachedToken = null;
}

export async function getToken(): Promise<string> {
  const rawToken =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    (await getGithubCLIToken()) ||
    extractBearerToken(process.env.Authorization ?? '');

  if (!rawToken) {
    throw new Error(
      'No GitHub token found. Please set GITHUB_TOKEN or GH_TOKEN environment variable or authenticate with GitHub CLI'
    );
  }

  // Store token securely for internal security benefits
  // (This doesn't change the public API - we still return the raw token for compatibility)
  SecureCredentialStore.setToken(rawToken);

  return rawToken;
}
