import { SecureCredentialStore } from '../../../security/credentialStore.js';
import { getGithubCLIToken } from '../../../utils/exec.js';
import crypto from 'crypto';

/**
 * Enhanced Token Manager
 *
 * Centralized token management with enterprise features. Single source of truth
 * for all GitHub token operations including resolution, caching, rotation, and events.
 *
 * Enterprise features:
 * - Token rotation with event notification
 * - Organization validation and configuration
 * - Audit logging integration
 * - Token source tracking
 */

// Enhanced Token Management State
let cachedToken: string | null = null;
let lastTokenSource: TokenSource = 'unknown';
let tokenMetadata: OAuthTokenInfo | GitHubAppTokenInfo | null = null;
let tokenExpiresAt: Date | null = null;

// Token refresh timers
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

// OAuth and GitHub App token sources
type TokenSource =
  | 'oauth'
  | 'github_app'
  | 'env'
  | 'cli'
  | 'authorization'
  | 'unknown';

// OAuth Token Information
interface OAuthTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
  tokenType: string;
  clientId?: string;
}

// GitHub App Token Information
interface GitHubAppTokenInfo {
  installationToken: string;
  expiresAt: Date;
  installationId: number;
  permissions: Record<string, string>;
  appId: string;
}

// Enhanced Token Resolution Result
interface TokenResolutionResult {
  token: string | null;
  source: TokenSource;
  metadata?: OAuthTokenInfo | GitHubAppTokenInfo;
  expiresAt?: Date;
}

// Enterprise Configuration
interface TokenManagerConfig {
  organizationId?: string;
  userId?: string;
  enableAuditLogging?: boolean;
  enableRateLimiting?: boolean;
  enableOrganizationValidation?: boolean;
}

interface TokenRotationHandler {
  (newToken: string, oldToken?: string): void | Promise<void>;
}

let config: TokenManagerConfig | null = null;
const rotationHandlers: Set<TokenRotationHandler> = new Set();

/**
 * Check if running in enterprise mode
 * Enterprise mode is detected by the presence of enterprise configuration
 */
function isEnterpriseMode(): boolean {
  // Check local token manager configuration
  const hasEnterpriseConfig = !!(
    config?.organizationId ||
    config?.enableAuditLogging ||
    config?.enableRateLimiting ||
    config?.enableOrganizationValidation
  );

  // Check for enterprise environment variables (legacy support)
  const hasOrgConfig = !!process.env.GITHUB_ORGANIZATION;
  const hasAuditConfig = process.env.AUDIT_ALL_ACCESS === 'true';
  const hasRateLimitConfig = !!(
    process.env.RATE_LIMIT_API_HOUR ||
    process.env.RATE_LIMIT_AUTH_HOUR ||
    process.env.RATE_LIMIT_TOKEN_HOUR
  );

  return (
    hasEnterpriseConfig || hasOrgConfig || hasAuditConfig || hasRateLimitConfig
  );
}

/**
 * Extract token from Authorization header
 * Moved from client.ts to centralize token handling
 */
function extractBearerToken(tokenInput: string): string | null {
  if (!tokenInput) return null;

  // Start by trimming the entire input
  let token = tokenInput.trim();

  // Remove "Bearer " prefix (case-insensitive) - get next word after Bearer
  token = token.replace(/^bearer\s+/i, '');

  // Remove "token " prefix (case insensitive)
  token = token.replace(/^token\s+/i, '');

  // Handle template format {{token}} - extract the actual token
  token = token.replace(/^\{\{(.+)\}\}$/, '$1');

  // Final trim to clean up any remaining whitespace
  const finalToken = token.trim();
  return finalToken || null;
}

/**
 * Try to get valid OAuth token from secure storage
 */
async function tryGetOAuthToken(): Promise<OAuthTokenInfo | null> {
  try {
    const accessToken = await getSecureCredential('oauth_access_token');
    const refreshToken = await getSecureCredential('oauth_refresh_token');
    const expiresAtStr = await getSecureCredential('oauth_expires_at');
    const scopesStr = await getSecureCredential('oauth_scopes');
    const clientId = await getSecureCredential('oauth_client_id');

    if (!accessToken) return null;

    const expiresAt = expiresAtStr
      ? new Date(expiresAtStr)
      : new Date(Date.now() + 3600000);
    const scopes = scopesStr ? JSON.parse(scopesStr) : [];

    // Check if token is expired
    if (expiresAt <= new Date()) {
      if (refreshToken) {
        // Try to refresh the token
        const refreshedToken = await refreshOAuthToken(
          refreshToken,
          clientId || undefined
        );
        return refreshedToken;
      }
      // Token expired and no refresh token
      await clearOAuthTokens();
      return null;
    }

    return {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresAt,
      scopes,
      tokenType: 'Bearer',
      clientId: clientId || undefined,
    };
  } catch (error) {
    // Log error in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_resolved', 'failure', {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Ignore audit logging errors
      }
    }
    return null;
  }
}

/**
 * Try to get valid GitHub App installation token
 */
async function tryGetGitHubAppToken(): Promise<GitHubAppTokenInfo | null> {
  try {
    const { ConfigManager } = await import('../../../config/serverConfig.js');
    const config = ConfigManager.getConfig();

    if (!config.githubApp?.enabled) return null;

    const token = await getSecureCredential('github_app_token');
    const expiresAtStr = await getSecureCredential('github_app_expires_at');
    const installationIdStr = await getSecureCredential(
      'github_app_installation_id'
    );
    const permissionsStr = await getSecureCredential('github_app_permissions');

    if (!token || !installationIdStr) return null;

    const expiresAt = expiresAtStr
      ? new Date(expiresAtStr)
      : new Date(Date.now() + 3600000);
    const installationId = parseInt(installationIdStr);
    const permissions = permissionsStr ? JSON.parse(permissionsStr) : {};

    // Check if token is expired
    if (expiresAt <= new Date()) {
      // Try to refresh GitHub App token
      const refreshedToken = await refreshGitHubAppToken(installationId);
      return refreshedToken;
    }

    return {
      installationToken: token,
      expiresAt,
      installationId,
      permissions,
      appId: config.githubApp.appId,
    };
  } catch (error) {
    // Log error in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_resolved', 'failure', {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Ignore audit logging errors
      }
    }
    return null;
  }
}

/**
 * Enhanced token resolution with OAuth support
 * Priority: OAuth > GitHub App > Environment > CLI > Authorization header
 */
async function resolveTokenWithOAuth(): Promise<TokenResolutionResult> {
  // 1. Try OAuth token first (highest priority for enterprise)
  const oauthToken = await tryGetOAuthToken();
  if (oauthToken) {
    return {
      token: oauthToken.accessToken,
      source: 'oauth',
      metadata: oauthToken,
      expiresAt: oauthToken.expiresAt,
    };
  }

  // 2. Try GitHub App token
  const appToken = await tryGetGitHubAppToken();
  if (appToken) {
    return {
      token: appToken.installationToken,
      source: 'github_app',
      metadata: appToken,
      expiresAt: appToken.expiresAt,
    };
  }

  // 3. Fall back to existing PAT resolution
  const existingResult = await resolveToken();
  return {
    token: existingResult.token,
    source: existingResult.source as TokenSource,
    metadata: undefined,
    expiresAt: undefined,
  };
}

/**
 * Legacy token resolution (for backward compatibility)
 * This is the original token resolution logic
 */
async function resolveToken(): Promise<{
  token: string | null;
  source: TokenSource;
}> {
  // Priority order: GITHUB_TOKEN → GH_TOKEN → GH CLI → Authorization header
  // Note: CLI is disabled in enterprise mode for security reasons

  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, source: 'env' };
  }

  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN, source: 'env' };
  }

  // Skip CLI token resolution in enterprise mode
  if (!isEnterpriseMode()) {
    const cliToken = await getGithubCLIToken();
    if (cliToken) {
      return { token: cliToken, source: 'cli' };
    }
  } else {
    // Log warning if enterprise mode detected and no env tokens
    if (
      !process.env.GITHUB_TOKEN &&
      !process.env.GH_TOKEN &&
      config?.enableAuditLogging
    ) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_validation', 'success', {
          reason: 'CLI token resolution disabled in enterprise mode',
          organizationId: config.organizationId,
          action: 'cli_disabled_enterprise',
        });
      } catch {
        // Ignore audit logging errors
      }
    }
  }

  const authToken = extractBearerToken(process.env.Authorization ?? '');
  if (authToken) {
    return { token: authToken, source: 'authorization' };
  }

  return { token: null, source: 'unknown' };
}

/**
 * Get GitHub token for API calls (Enhanced with OAuth support)
 * Single source of truth for token access
 *
 * @returns GitHub token or null if not available
 */
export async function getGitHubToken(): Promise<string | null> {
  // Return cached token if available and not expired
  if (cachedToken && (!tokenExpiresAt || tokenExpiresAt > new Date())) {
    return cachedToken;
  }

  const result = await resolveTokenWithOAuth();

  if (result.token) {
    // Cache the token and track metadata
    cachedToken = result.token;
    lastTokenSource = result.source;
    tokenMetadata = result.metadata || null;
    tokenExpiresAt = result.expiresAt || null;

    // Schedule refresh if token has expiration
    if (result.expiresAt && result.metadata) {
      scheduleTokenRefresh(result.expiresAt, result.source, result.metadata);
    }

    return result.token;
  }

  return null;
}

/**
 * Clear cached token (useful for testing or token refresh)
 * Enhanced for OAuth support
 */
export function clearCachedToken(): void {
  cachedToken = null;
  lastTokenSource = 'unknown';
  tokenMetadata = null;
  tokenExpiresAt = null;

  // Clear all refresh timers
  refreshTimers.forEach(timer => clearTimeout(timer));
  refreshTimers.clear();
}

/**
 * Get token with error throwing for bootstrap (Enhanced with OAuth support)
 * Maintains backward compatibility
 */
export async function getToken(): Promise<string> {
  const result = await resolveTokenWithOAuth();

  if (!result.token) {
    const enterpriseMode = isEnterpriseMode();
    const errorMessage = enterpriseMode
      ? 'No GitHub token found. In enterprise mode, please configure OAuth, GitHub App, or set GITHUB_TOKEN/GH_TOKEN environment variable (CLI authentication is disabled for security)'
      : 'No GitHub token found. Please configure OAuth authentication, set GITHUB_TOKEN/GH_TOKEN environment variable, or authenticate with GitHub CLI';

    throw new Error(errorMessage);
  }

  // Store token securely for internal security benefits
  SecureCredentialStore.setToken(result.token);

  // Update cached token and metadata
  cachedToken = result.token;
  lastTokenSource = result.source;
  tokenMetadata = result.metadata || null;
  tokenExpiresAt = result.expiresAt || null;

  return result.token;
}

// ===== ENTERPRISE FEATURES (New, Non-breaking) =====

/**
 * Initialize token manager with enterprise configuration
 * No-op if no config provided - maintains backward compatibility
 */
export function initialize(enterpriseConfig?: TokenManagerConfig): void {
  if (enterpriseConfig) {
    config = { ...enterpriseConfig };

    // Initialize enterprise modules if configured
    if (config.enableAuditLogging) {
      // Will be initialized by bootstrap
    }

    if (config.enableOrganizationValidation && config.organizationId) {
      // Will be initialized by bootstrap
    }

    if (config.enableRateLimiting) {
      // Will be initialized by bootstrap
    }
  }
}

/**
 * Register handler for token rotation events
 * Returns cleanup function
 */
export function onTokenRotated(handler: TokenRotationHandler): () => void {
  rotationHandlers.add(handler);
  return () => {
    rotationHandlers.delete(handler);
  };
}

/**
 * Get the source of the current token (Enhanced)
 */
export function getTokenSource(): TokenSource {
  return lastTokenSource;
}

/**
 * Rotate token and notify all handlers
 * For enterprise token management
 */
export async function rotateToken(newToken: string): Promise<void> {
  const oldToken = cachedToken;

  // Update cached token
  cachedToken = newToken;
  lastTokenSource = 'unknown'; // Manual rotation

  // Store securely
  SecureCredentialStore.setToken(newToken);

  // Notify all handlers
  const notifications = Array.from(rotationHandlers).map(handler => {
    try {
      return Promise.resolve(handler(newToken, oldToken || undefined));
    } catch (error) {
      // Log error but continue with other handlers
      return Promise.resolve();
    }
  });

  await Promise.allSettled(notifications);
}

/**
 * Get current enterprise configuration
 * For testing and debugging
 */
export function getConfig(): TokenManagerConfig | null {
  return config ? { ...config } : null;
}

/**
 * Clear enterprise configuration
 * For testing purposes
 * @internal
 */
export function clearConfig(): void {
  config = null;
}

/**
 * Check if CLI token resolution is available
 * Returns false in enterprise mode for security reasons
 */
export function isCliTokenResolutionEnabled(): boolean {
  return !isEnterpriseMode();
}

/**
 * Check if running in enterprise mode
 * Public API for external checks
 */
export function isEnterpriseTokenManager(): boolean {
  return isEnterpriseMode();
}

// ===== OAUTH 2.0/2.1 SUPPORT =====

/**
 * Refresh OAuth token using refresh token
 */
async function refreshOAuthToken(
  refreshToken: string,
  clientId?: string
): Promise<OAuthTokenInfo | null> {
  try {
    const { ConfigManager } = await import('../../../config/serverConfig.js');
    const config = ConfigManager.getConfig();

    if (!config.oauth?.enabled || !config.oauth.clientSecret) {
      throw new Error('OAuth not properly configured');
    }

    const tokenUrl =
      config.oauth.tokenUrl ||
      (config.githubHost
        ? `${config.githubHost}/login/oauth/access_token`
        : 'https://github.com/login/oauth/access_token');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': `octocode-mcp/${config.version}`,
      },
      body: new URLSearchParams({
        client_id: clientId || config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`OAuth error: ${data.error_description || data.error}`);
    }

    const newTokenInfo: OAuthTokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      tokenType: data.token_type || 'Bearer',
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      scopes: data.scope ? data.scope.split(' ') : [],
      clientId: clientId || config.oauth.clientId,
    };

    // Store the new tokens securely
    await storeOAuthTokens(newTokenInfo);

    // Schedule next refresh
    scheduleTokenRefresh(newTokenInfo.expiresAt, 'oauth', newTokenInfo);

    // Log successful refresh in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_rotation', 'success', {
          clientId: newTokenInfo.clientId,
          expiresAt: newTokenInfo.expiresAt.toISOString(),
          scopes: newTokenInfo.scopes,
        });
      } catch {
        // Ignore audit logging errors
      }
    }

    return newTokenInfo;
  } catch (error) {
    // Clear invalid tokens
    await clearOAuthTokens();

    // Log failure in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_rotation', 'failure', {
          error: error instanceof Error ? error.message : String(error),
          clientId,
        });
      } catch {
        // Ignore audit logging errors
      }
    }

    throw error;
  }
}

/**
 * Refresh GitHub App installation token
 */
async function refreshGitHubAppToken(
  installationId: number
): Promise<GitHubAppTokenInfo | null> {
  try {
    const { ConfigManager } = await import('../../../config/serverConfig.js');
    const config = ConfigManager.getConfig();

    if (!config.githubApp?.enabled) {
      throw new Error('GitHub App not configured');
    }

    // Generate JWT for app authentication
    const jwt = await generateGitHubAppJWT(
      config.githubApp.appId,
      config.githubApp.privateKey
    );

    const baseUrl = config.githubApp.baseUrl || 'https://api.github.com';
    const response = await fetch(
      `${baseUrl}/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': `octocode-mcp/${config.version}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `GitHub App token refresh failed: ${response.statusText}`
      );
    }

    const data = await response.json();

    const newTokenInfo: GitHubAppTokenInfo = {
      installationToken: data.token,
      expiresAt: new Date(data.expires_at),
      installationId,
      permissions: data.permissions || {},
      appId: config.githubApp.appId,
    };

    // Store the new token securely
    await storeGitHubAppToken(newTokenInfo);

    // Schedule next refresh; let scheduler subtract the buffer
    scheduleTokenRefresh(newTokenInfo.expiresAt, 'github_app', newTokenInfo);

    // Log successful refresh in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_rotation', 'success', {
          appId: newTokenInfo.appId,
          installationId,
          expiresAt: newTokenInfo.expiresAt.toISOString(),
          permissions: Object.keys(newTokenInfo.permissions),
        });
      } catch {
        // Ignore audit logging errors
      }
    }

    return newTokenInfo;
  } catch (error) {
    // Log failure in enterprise mode
    if (isEnterpriseMode()) {
      try {
        const { logAuthEvent } = await import(
          '../../../security/auditLogger.js'
        );
        logAuthEvent('token_rotation', 'failure', {
          error: error instanceof Error ? error.message : String(error),
          installationId,
        });
      } catch {
        // Ignore audit logging errors
      }
    }

    throw error;
  }
}

/**
 * Store OAuth tokens securely
 */
async function storeOAuthTokens(tokenInfo: OAuthTokenInfo): Promise<void> {
  await setSecureCredential('oauth_access_token', tokenInfo.accessToken);
  if (tokenInfo.refreshToken) {
    await setSecureCredential('oauth_refresh_token', tokenInfo.refreshToken);
  }
  await setSecureCredential(
    'oauth_expires_at',
    tokenInfo.expiresAt.toISOString()
  );
  await setSecureCredential('oauth_scopes', JSON.stringify(tokenInfo.scopes));
  if (tokenInfo.clientId) {
    await setSecureCredential('oauth_client_id', tokenInfo.clientId);
  }
}

/**
 * Store GitHub App tokens securely
 */
async function storeGitHubAppToken(
  tokenInfo: GitHubAppTokenInfo
): Promise<void> {
  await setSecureCredential('github_app_token', tokenInfo.installationToken);
  await setSecureCredential(
    'github_app_expires_at',
    tokenInfo.expiresAt.toISOString()
  );
  await setSecureCredential(
    'github_app_installation_id',
    tokenInfo.installationId.toString()
  );
  await setSecureCredential(
    'github_app_permissions',
    JSON.stringify(tokenInfo.permissions)
  );
}

/**
 * Clear OAuth tokens from secure storage
 */
export async function clearOAuthTokens(): Promise<void> {
  await deleteSecureCredential('oauth_access_token');
  await deleteSecureCredential('oauth_refresh_token');
  await deleteSecureCredential('oauth_expires_at');
  await deleteSecureCredential('oauth_scopes');
  await deleteSecureCredential('oauth_client_id');
}

/**
 * Schedule token refresh before expiration
 */
function scheduleTokenRefresh(
  expiresAt: Date,
  source: TokenSource,
  metadata: OAuthTokenInfo | GitHubAppTokenInfo
): void {
  const refreshTime = expiresAt.getTime() - Date.now() - 5 * 60 * 1000; // 5 minutes before expiry
  const timerId = `${source}_${Date.now()}`;

  if (refreshTime <= 0) {
    // Token already expired, refresh immediately
    if (
      source === 'oauth' &&
      'refreshToken' in metadata &&
      metadata.refreshToken
    ) {
      refreshOAuthToken(metadata.refreshToken, metadata.clientId).catch(
        async error => {
          if (isEnterpriseMode()) {
            try {
              const { logAuthEvent } = await import(
                '../../../security/auditLogger.js'
              );
              logAuthEvent('auth_failure', 'failure', {
                error: error instanceof Error ? error.message : String(error),
                immediate: true,
                source,
              });
            } catch {
              // Ignore audit logging errors
            }
          }
        }
      );
    } else if (source === 'github_app' && 'installationId' in metadata) {
      refreshGitHubAppToken(metadata.installationId).catch(async error => {
        if (isEnterpriseMode()) {
          try {
            const { logAuthEvent } = await import(
              '../../../security/auditLogger.js'
            );
            logAuthEvent('auth_failure', 'failure', {
              error: error instanceof Error ? error.message : String(error),
              immediate: true,
              source,
            });
          } catch {
            // Ignore audit logging errors
          }
        }
      });
    }
    return;
  }

  const timer = setTimeout(async () => {
    try {
      if (
        source === 'oauth' &&
        'refreshToken' in metadata &&
        metadata.refreshToken
      ) {
        await refreshOAuthToken(metadata.refreshToken, metadata.clientId);
      } else if (source === 'github_app' && 'installationId' in metadata) {
        await refreshGitHubAppToken(metadata.installationId);
      }
    } catch (error) {
      if (isEnterpriseMode()) {
        try {
          const { logAuthEvent } = await import(
            '../../../security/auditLogger.js'
          );
          await logAuthEvent('token_rotation', 'failure', {
            error: error instanceof Error ? error.message : String(error),
            source,
          });
        } catch {
          // Ignore audit logging errors
        }
      }
    } finally {
      refreshTimers.delete(timerId);
    }
  }, refreshTime);

  refreshTimers.set(timerId, timer);
}

/**
 * Helper functions for secure credential operations
 */
async function setSecureCredential(key: string, value: string): Promise<void> {
  const credentialId = SecureCredentialStore.setCredential(value);
  // Store the credential ID with a key prefix for retrieval
  const keyMapping = await getKeyMappings();
  keyMapping[key] = credentialId;
  await storeKeyMappings(keyMapping);
}

async function getSecureCredential(key: string): Promise<string | null> {
  try {
    const keyMapping = await getKeyMappings();
    const credentialId = keyMapping[key];
    if (!credentialId) return null;

    return SecureCredentialStore.getCredential(credentialId);
  } catch {
    return null;
  }
}

async function deleteSecureCredential(key: string): Promise<void> {
  try {
    const keyMapping = await getKeyMappings();
    const credentialId = keyMapping[key];
    if (credentialId) {
      SecureCredentialStore.removeCredential(credentialId);
      delete keyMapping[key];
      await storeKeyMappings(keyMapping);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Key mapping storage (simple in-memory for now, could be enhanced with persistent storage)
 */
let keyMappings: Record<string, string> = {};

async function getKeyMappings(): Promise<Record<string, string>> {
  return { ...keyMappings };
}

async function storeKeyMappings(
  mappings: Record<string, string>
): Promise<void> {
  keyMappings = { ...mappings };
}

/**
 * Generate GitHub App JWT for authentication
 */
async function generateGitHubAppJWT(
  appId: string,
  privateKey: string
): Promise<string> {
  // Simple JWT generation without external dependencies
  // For production, consider using the 'jsonwebtoken' package

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 1 minute ago (clock skew)
    exp: now + 10 * 60, // Expires in 10 minutes (GitHub max)
    iss: appId, // GitHub App ID
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url'
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(signatureInput),
    privateKey
  );
  const encodedSignature = signature.toString('base64url');

  return `${signatureInput}.${encodedSignature}`;
}

// ===== PUBLIC OAUTH API =====

/**
 * Store OAuth tokens (for external OAuth flow completion)
 */
export async function storeOAuthTokenInfo(
  tokenInfo: OAuthTokenInfo
): Promise<void> {
  await storeOAuthTokens(tokenInfo);

  // Update cached state
  cachedToken = tokenInfo.accessToken;
  lastTokenSource = 'oauth';
  tokenMetadata = tokenInfo;
  tokenExpiresAt = tokenInfo.expiresAt;

  // Schedule refresh
  scheduleTokenRefresh(tokenInfo.expiresAt, 'oauth', tokenInfo);

  // Log in enterprise mode
  if (isEnterpriseMode()) {
    try {
      const { logAuthEvent } = await import('../../../security/auditLogger.js');
      logAuthEvent('token_resolved', 'success', {
        clientId: tokenInfo.clientId,
        expiresAt: tokenInfo.expiresAt.toISOString(),
        scopes: tokenInfo.scopes,
      });
    } catch {
      // Ignore audit logging errors
    }
  }
}

/**
 * Store GitHub App tokens (for external GitHub App setup)
 */
export async function storeGitHubAppTokenInfo(
  tokenInfo: GitHubAppTokenInfo
): Promise<void> {
  await storeGitHubAppToken(tokenInfo);

  // Update cached state
  cachedToken = tokenInfo.installationToken;
  lastTokenSource = 'github_app';
  tokenMetadata = tokenInfo;
  tokenExpiresAt = tokenInfo.expiresAt;

  // Schedule refresh
  // Pass actual expiration; scheduler applies its own safety buffer
  scheduleTokenRefresh(tokenInfo.expiresAt, 'github_app', tokenInfo);

  // Log in enterprise mode
  if (isEnterpriseMode()) {
    try {
      const { logAuthEvent } = await import('../../../security/auditLogger.js');
      logAuthEvent('token_resolved', 'success', {
        appId: tokenInfo.appId,
        installationId: tokenInfo.installationId,
        expiresAt: tokenInfo.expiresAt.toISOString(),
        permissions: Object.keys(tokenInfo.permissions),
      });
    } catch {
      // Ignore audit logging errors
    }
  }
}

/**
 * Get current token metadata
 */
export async function getTokenMetadata(): Promise<{
  source: TokenSource;
  expiresAt?: Date;
  scopes?: string[];
  permissions?: Record<string, string>;
  clientId?: string;
  appId?: string;
  installationId?: number;
}> {
  // Ensure we have the latest token info
  await getGitHubToken();

  const metadata: {
    source: TokenSource;
    expiresAt?: Date;
    scopes?: string[];
    permissions?: Record<string, string>;
    clientId?: string;
    appId?: string;
    installationId?: number;
  } = {
    source: lastTokenSource,
    expiresAt: tokenExpiresAt || undefined,
  };

  if (tokenMetadata) {
    if ('scopes' in tokenMetadata) {
      // OAuth token
      metadata.scopes = tokenMetadata.scopes;
      metadata.clientId = tokenMetadata.clientId;
    } else if ('permissions' in tokenMetadata) {
      // GitHub App token
      metadata.permissions = tokenMetadata.permissions;
      metadata.appId = tokenMetadata.appId;
      metadata.installationId = tokenMetadata.installationId;
    }
  }

  return metadata;
}

/**
 * Manually refresh current token
 */
export async function refreshCurrentToken(): Promise<string> {
  if (!tokenMetadata || !tokenExpiresAt) {
    throw new Error('No refreshable token available');
  }

  if (
    lastTokenSource === 'oauth' &&
    'refreshToken' in tokenMetadata &&
    tokenMetadata.refreshToken
  ) {
    const refreshedToken = await refreshOAuthToken(
      tokenMetadata.refreshToken,
      tokenMetadata.clientId
    );
    if (refreshedToken) {
      return refreshedToken.accessToken;
    }
  } else if (
    lastTokenSource === 'github_app' &&
    'installationId' in tokenMetadata
  ) {
    const refreshedToken = await refreshGitHubAppToken(
      tokenMetadata.installationId
    );
    if (refreshedToken) {
      return refreshedToken.installationToken;
    }
  }

  throw new Error(`Cannot refresh token of type: ${lastTokenSource}`);
}

/**
 * Clear all OAuth and GitHub App tokens
 */
export async function clearAllTokens(): Promise<void> {
  await clearOAuthTokens();
  await deleteSecureCredential('github_app_token');
  await deleteSecureCredential('github_app_expires_at');
  await deleteSecureCredential('github_app_installation_id');
  await deleteSecureCredential('github_app_permissions');

  // Clear cached state
  clearCachedToken();
}

/**
 * Export extractBearerToken for testing purposes
 * @internal
 */
export { extractBearerToken };
