import { getGithubCLIToken } from './exec.js';

/**
 * Token Manager
 *
 * Simple token management for GitHub authentication.
 * Supports GITHUB_TOKEN, GH_TOKEN, and GitHub CLI tokens.
 *
 * Features:
 * - Token caching
 * - Multiple token sources with priority order
 * - CLI token fallback
 */

// Simple Token Management State
let cachedToken: string | null = null;
let lastTokenSource: TokenSource = 'unknown';

// Token sources
type TokenSource = 'env' | 'cli' | 'unknown';

// Token Resolution Result
interface TokenResolutionResult {
  token: string | null;
  source: TokenSource;
}

// Advanced Configuration
interface TokenManagerConfig {
  userId?: string;
  enableAuditLogging?: boolean;
}

interface TokenRotationHandler {
  (newToken: string, oldToken?: string): void | Promise<void>;
}

let config: TokenManagerConfig | null = null;
const rotationHandlers: Set<TokenRotationHandler> = new Set();

/**
 * Check if audit logging is enabled
 */
function isAuditEnabled(): boolean {
  return (
    !!config?.enableAuditLogging || process.env.AUDIT_ALL_ACCESS === 'true'
  );
}


/**
 * Token resolution with environment variables and CLI
 */
async function resolveToken(): Promise<TokenResolutionResult> {
  // Priority order: GITHUB_TOKEN → GH_TOKEN → GH CLI
  // Note: CLI may be disabled in advanced mode for security reasons

  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, source: 'env' };
  }

  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN, source: 'env' };
  }

  // Try CLI token as fallback (unless in advanced mode)
  if (!isAuditEnabled()) {
    const cliToken = await getGithubCLIToken();
    if (cliToken) {
      return { token: cliToken, source: 'cli' };
    }
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

  const result = await resolveToken();

  if (result.token) {
    // Cache the token
    cachedToken = result.token;
    lastTokenSource = result.source;

    return result.token;
  }

  return null;
}

/**
 * Clear cached token (useful for testing or token refresh)
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
  const result = await resolveToken();

  if (!result.token) {
    const errorMessage = isAuditEnabled()
      ? 'No GitHub token found. In advanced mode, please set GITHUB_TOKEN/GH_TOKEN environment variable (CLI authentication is disabled for security)'
      : 'No GitHub token found. Please set GITHUB_TOKEN/GH_TOKEN environment variable, or authenticate with GitHub CLI';

    throw new Error(errorMessage);
  }

  // Update cached token
  cachedToken = result.token;
  lastTokenSource = result.source;

  return result.token;
}

// ===== CONFIGURATION =====

/**
 * Initialize token manager with configuration
 */
export function initialize(tokenConfig?: TokenManagerConfig): void {
  if (tokenConfig) {
    config = { ...tokenConfig };
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
 */
export async function rotateToken(newToken: string): Promise<void> {
  const oldToken = cachedToken;

  // Update cached token
  cachedToken = newToken;
  lastTokenSource = 'unknown'; // Manual rotation

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
 * Get current configuration
 * For testing and debugging
 */
export function getConfig(): TokenManagerConfig | null {
  return config ? { ...config } : null;
}

/**
 * Clear configuration
 * For testing purposes
 * @internal
 */
export function clearConfig(): void {
  config = null;
}

/**
 * Check if CLI token resolution is available
 */
export function isCliTokenResolutionEnabled(): boolean {
  return true;
}

/**
 * Check if audit logging is enabled
 * Public API for external checks
 */
export function isAdvancedTokenManager(): boolean {
  return isAuditEnabled();
}

