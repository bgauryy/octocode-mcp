import { SecureCredentialStore } from '../../../security/credentialStore.js';
import { getGithubCLIToken } from '../../../utils/exec.js';

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

// Token Management State
let cachedToken: string | null = null;
let lastTokenSource: 'env' | 'cli' | 'authorization' | 'unknown' = 'unknown';

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
  // Check for enterprise environment variables
  const hasOrgConfig = !!process.env.GITHUB_ORGANIZATION;
  const hasAuditConfig = process.env.AUDIT_ALL_ACCESS === 'true';
  const hasRateLimitConfig = !!(
    process.env.RATE_LIMIT_API_HOUR ||
    process.env.RATE_LIMIT_AUTH_HOUR ||
    process.env.RATE_LIMIT_TOKEN_HOUR
  );

  // Also check configuration state
  const hasEnterpriseConfig = !!(
    config?.organizationId ||
    config?.enableAuditLogging ||
    config?.enableRateLimiting ||
    config?.enableOrganizationValidation
  );

  return (
    hasOrgConfig || hasAuditConfig || hasRateLimitConfig || hasEnterpriseConfig
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
 * Resolve GitHub token from various sources with preference order
 * This is the single source of truth for token resolution
 */
async function resolveToken(): Promise<{
  token: string | null;
  source: typeof lastTokenSource;
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
 * Get GitHub token for API calls
 * Single source of truth for token access
 *
 * @returns GitHub token or null if not available
 */
export async function getGitHubToken(): Promise<string | null> {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  const { token, source } = await resolveToken();

  if (token) {
    // Cache the token and track source
    cachedToken = token;
    lastTokenSource = source;
    return token;
  }

  return null;
}

/**
 * Clear cached token (useful for testing or token refresh)
 * Backward compatible API
 */
export function clearCachedToken(): void {
  cachedToken = null;
  lastTokenSource = 'unknown';
}

/**
 * Get token with error throwing for bootstrap
 * Maintains backward compatibility
 */
export async function getToken(): Promise<string> {
  const { token } = await resolveToken();

  if (!token) {
    const enterpriseMode = isEnterpriseMode();
    const errorMessage = enterpriseMode
      ? 'No GitHub token found. In enterprise mode, please set GITHUB_TOKEN or GH_TOKEN environment variable (CLI authentication is disabled for security)'
      : 'No GitHub token found. Please set GITHUB_TOKEN or GH_TOKEN environment variable or authenticate with GitHub CLI';

    throw new Error(errorMessage);
  }

  // Store token securely for internal security benefits
  // (This doesn't change the public API - we still return the raw token for compatibility)
  SecureCredentialStore.setToken(token);

  return token;
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
 * Get the source of the current token
 */
export function getTokenSource(): 'env' | 'cli' | 'authorization' | 'unknown' {
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

/**
 * Export extractBearerToken for testing purposes
 * @internal
 */
export { extractBearerToken };
