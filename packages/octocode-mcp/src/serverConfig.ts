import type { ProviderType } from './providers/types.js';
import { getGithubCLIToken } from './utils/exec/index.js';
import {
  getEnvTokenSource,
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,
} from './utils/credentials/index.js';
import { initializeSecureStorage } from 'octocode-shared';
import { version } from '../package.json';
import type {
  ServerConfig,
  TokenSourceType,
  GitLabConfig,
  GitLabTokenSourceType,
} from './types.js';
import { CONFIG_ERRORS } from './errorCodes.js';
import { maskSensitiveData } from './security/mask.js';

/** Result of token resolution with source tracking */
interface TokenResolutionResult {
  token: string | null;
  source: TokenSourceType;
}

/** Result of GitLab token resolution with source tracking */
interface GitLabTokenResolutionResult {
  token: string | null;
  source: GitLabTokenSourceType;
}

let config: ServerConfig | null = null;
let initializationPromise: Promise<void> | null = null;

// Injectable function for testing (gh CLI is passed to resolveTokenFull)
let _getGithubCLIToken = getGithubCLIToken;

// Legacy mock for backward compatibility with existing tests
// Maps { token, source } format to the new split functions
type ResolvedToken = { token: string; source: string } | null;
type ResolveTokenFn = () => Promise<ResolvedToken>;
let _legacyResolveToken: ResolveTokenFn | null = null;

// Injectable resolveTokenFull for testing
type ResolveTokenFullFn = (options?: {
  hostname?: string;
  clientId?: string;
  getGhCliToken?: GhCliTokenGetter;
}) => Promise<FullTokenResolution | null>;
let _resolveTokenFull: ResolveTokenFullFn = resolveTokenFull;

/**
 * Maps source strings from various systems to internal TokenSourceType.
 *
 * Handles sources from:
 * - octocode-shared: 'env:*', 'gh-cli', 'keychain', 'file'
 * - legacy tests: 'env', 'octocode', 'octocode-storage'
 *
 * @param source - Source string from resolver
 * @param getEnvSource - Optional function to get specific env var name
 */
function mapSharedSourceToInternal(
  source: string | null | undefined,
  getEnvSource?: () => string | null
): TokenSourceType {
  if (!source) return 'none';

  // Already prefixed env source
  if (source.startsWith('env:')) return source as TokenSourceType;

  // Plain 'env' from legacy - need to determine specific env var
  if (source === 'env') {
    const specific = getEnvSource?.();
    return (specific as TokenSourceType) ?? 'env:GITHUB_TOKEN';
  }

  // CLI source
  if (source === 'gh-cli') return 'gh-cli';

  // Storage sources (keychain, file, octocode variants)
  if (['keychain', 'file', 'octocode', 'octocode-storage'].includes(source)) {
    return 'octocode-storage';
  }

  return 'none';
}

/**
 * @internal - For testing only
 * Supports both new and legacy APIs:
 * - New: Use `resolveTokenFull` to mock the entire resolution chain
 * - Legacy: Use `getGithubCLIToken` to mock gh CLI fallback
 * Note: Legacy `getTokenFromEnv`, `getOctocodeToken`, `getOctocodeTokenWithRefresh`
 *       are deprecated - use `resolveTokenFull` instead.
 */
export function _setTokenResolvers(resolvers: {
  getGithubCLIToken?: typeof getGithubCLIToken;
  resolveTokenFull?: ResolveTokenFullFn;
}): void {
  if (resolvers.getGithubCLIToken) {
    _getGithubCLIToken = resolvers.getGithubCLIToken;
  }
  if (resolvers.resolveTokenFull) {
    _resolveTokenFull = resolvers.resolveTokenFull;
  }
}

/**
 * @internal - For testing only
 */
export function _resetTokenResolvers(): void {
  _getGithubCLIToken = getGithubCLIToken;
  _resolveTokenFull = resolveTokenFull;
  _legacyResolveToken = null;
}

/**
 * @internal - For testing only (LEGACY API - backward compatibility)
 * Sets a mock function that returns { token, source } | null
 */
export function _setResolveTokenFn(fn: ResolveTokenFn): void {
  _legacyResolveToken = fn;
}

/**
 * @internal - For testing only (LEGACY API - backward compatibility)
 */
export function _resetResolveTokenFn(): void {
  _legacyResolveToken = null;
}

function parseStringArray(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Parse a boolean environment variable with support for various formats.
 * Handles whitespace, casing, and common truthy/falsy values.
 * @param value - The environment variable value
 * @param defaultValue - Default value if undefined/empty
 * @returns Parsed boolean value
 */
function parseBooleanEnv(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined || value === null) return defaultValue;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return defaultValue;
  return trimmed === 'true' || trimmed === '1';
}

/**
 * Parse a boolean environment variable that defaults to true unless explicitly set to false.
 * @param value - The environment variable value
 * @returns true unless value is explicitly 'false'
 */
function parseBooleanEnvDefaultTrue(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return true;
  return trimmed !== 'false' && trimmed !== '0';
}

async function resolveGitHubToken(): Promise<TokenResolutionResult> {
  // Support legacy test mock (backward compatibility)
  if (_legacyResolveToken) {
    try {
      const resolved = await _legacyResolveToken();
      if (resolved?.token) {
        return {
          token: resolved.token,
          source: mapSharedSourceToInternal(resolved.source, getEnvTokenSource),
        };
      }
      return { token: null, source: 'none' };
    } catch (error) {
      if (error instanceof Error && error.message) {
        error.message = maskSensitiveData(error.message);
      }
      return { token: null, source: 'none' };
    }
  }

  // Delegate to octocode-shared's resolveTokenFull for centralized logic
  // Priority: env vars (1-3) → octocode storage (4-5) → gh CLI (6)
  try {
    const result = await _resolveTokenFull({
      hostname: 'github.com',
      getGhCliToken: _getGithubCLIToken,
    });

    if (result?.token) {
      return {
        token: result.token,
        source: mapSharedSourceToInternal(result.source),
      };
    }

    return { token: null, source: 'none' };
  } catch (error) {
    if (error instanceof Error && error.message) {
      error.message = maskSensitiveData(error.message);
    }
    return { token: null, source: 'none' };
  }
}

// ============================================================================
// GITLAB TOKEN RESOLUTION
// ============================================================================

/** Default GitLab host */
const DEFAULT_GITLAB_HOST = 'https://gitlab.com';

// ============================================================================
// CONFIGURATION LIMITS
// ============================================================================

/** Minimum timeout - 5 seconds (prevents accidental misconfiguration) */
const MIN_TIMEOUT = 5000;
/** Default timeout - 30 seconds */
const DEFAULT_TIMEOUT = 30000;
/** Minimum retries */
const MIN_RETRIES = 0;
/** Maximum retries */
const MAX_RETRIES_LIMIT = 10;
/** Default retries */
const DEFAULT_RETRIES = 3;

/**
 * Resolve GitLab token from environment variables.
 * Priority: GITLAB_TOKEN > GL_TOKEN
 */
function resolveGitLabToken(): GitLabTokenResolutionResult {
  // Check GITLAB_TOKEN first (primary)
  const gitlabToken = process.env.GITLAB_TOKEN?.trim();
  if (gitlabToken) {
    return { token: gitlabToken, source: 'env:GITLAB_TOKEN' };
  }

  // Check GL_TOKEN (fallback)
  const glToken = process.env.GL_TOKEN?.trim();
  if (glToken) {
    return { token: glToken, source: 'env:GL_TOKEN' };
  }

  return { token: null, source: 'none' };
}

/**
 * Resolve GitLab configuration from environment variables.
 * @returns GitLab configuration object
 */
function resolveGitLabConfig(): GitLabConfig {
  const tokenResult = resolveGitLabToken();
  const host = process.env.GITLAB_HOST?.trim() || DEFAULT_GITLAB_HOST;

  return {
    host,
    token: tokenResult.token,
    tokenSource: tokenResult.source,
    isConfigured: tokenResult.token !== null,
  };
}

export async function initialize(): Promise<void> {
  if (config !== null) {
    return;
  }
  if (initializationPromise !== null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    // Initialize secure storage FIRST (enables keychain access for stored tokens)
    // This must happen before any token resolution to find credentials stored by CLI
    await initializeSecureStorage();

    // Resolve token once at startup for initial config (source tracking)
    // Token is NOT cached - subsequent calls to getGitHubToken() will re-resolve
    const tokenResult = await resolveGitHubToken();

    // Parse logging flag (defaults to true unless explicitly 'false' or '0')
    // Also respect standard OCTOCODE_TELEMETRY_DISABLED=1 convention
    const telemetryDisabled = parseBooleanEnv(
      process.env.OCTOCODE_TELEMETRY_DISABLED,
      false
    );
    const isLoggingEnabled =
      !telemetryDisabled && parseBooleanEnvDefaultTrue(process.env.LOG);

    // Parse ENABLE_LOCAL with fallback to LOCAL env var
    // Supports: '1', 'true', 'TRUE', ' true ', etc.
    const enableLocal =
      parseBooleanEnv(process.env.ENABLE_LOCAL, false) ||
      parseBooleanEnv(process.env.LOCAL, false);

    config = {
      version: version,
      githubApiUrl:
        process.env.GITHUB_API_URL?.trim() || 'https://api.github.com',
      toolsToRun: parseStringArray(process.env.TOOLS_TO_RUN),
      enableTools: parseStringArray(process.env.ENABLE_TOOLS),
      disableTools: parseStringArray(process.env.DISABLE_TOOLS),
      enableLogging: isLoggingEnabled,
      timeout: Math.max(
        MIN_TIMEOUT,
        parseInt(
          process.env.REQUEST_TIMEOUT?.trim() || String(DEFAULT_TIMEOUT)
        ) || DEFAULT_TIMEOUT
      ),
      maxRetries: Math.max(
        MIN_RETRIES,
        Math.min(
          MAX_RETRIES_LIMIT,
          parseInt(
            process.env.MAX_RETRIES?.trim() || String(DEFAULT_RETRIES)
          ) || DEFAULT_RETRIES
        )
      ),
      loggingEnabled: isLoggingEnabled,
      enableLocal,
      tokenSource: tokenResult.source,
      gitlab: resolveGitLabConfig(),
    };
  })();

  await initializationPromise;
}

export function cleanup(): void {
  config = null;
  initializationPromise = null;
}

export function getServerConfig(): ServerConfig {
  if (!config) {
    // NOTE: Circular dependency prevents calling logSessionError here
    const sanitizedMessage = maskSensitiveData(
      CONFIG_ERRORS.NOT_INITIALIZED.message
    );
    throw new Error(sanitizedMessage);
  }
  return config;
}

/**
 * Get the current GitHub token.
 * Always resolves fresh - no caching. Let octocode-shared handle fallbacks.
 * Token can change at runtime (deletion, refresh, new login).
 */
export async function getGitHubToken(): Promise<string | null> {
  const result = await resolveGitHubToken();
  return result.token;
}

export async function getToken(): Promise<string | null> {
  return getGitHubToken();
}

export function isLocalEnabled(): boolean {
  return getServerConfig().enableLocal;
}

export function isLoggingEnabled(): boolean {
  return config?.loggingEnabled ?? false;
}

/**
 * Get the source of the current GitHub token.
 * Always resolves fresh - no caching. Token source can change at runtime.
 * Returns the type indicating where the token was found:
 * - 'env:OCTOCODE_TOKEN', 'env:GH_TOKEN', 'env:GITHUB_TOKEN' for env vars
 * - 'gh-cli' for GitHub CLI
 * - 'octocode-storage' for stored credentials
 * - 'none' if no token was found
 */
export async function getTokenSource(): Promise<TokenSourceType> {
  const result = await resolveGitHubToken();
  return result.source;
}

// ============================================================================
// GITLAB CONFIGURATION EXPORTS
// ============================================================================

/**
 * Get the GitLab configuration.
 * Always resolves fresh - no caching. Let environment handle changes.
 * Token can change at runtime (deletion, refresh, new login).
 * @returns GitLab configuration
 */
export function getGitLabConfig(): GitLabConfig {
  return resolveGitLabConfig();
}

/**
 * Get the GitLab API token.
 * Always resolves fresh - not cached. Token can change at runtime.
 * @returns GitLab token or null if not configured
 */
export function getGitLabToken(): string | null {
  const result = resolveGitLabToken();
  return result.token;
}

/**
 * Get the GitLab host URL.
 * @returns GitLab host URL (defaults to https://gitlab.com)
 */
export function getGitLabHost(): string {
  return process.env.GITLAB_HOST?.trim() || DEFAULT_GITLAB_HOST;
}

/**
 * Get the source of the current GitLab token.
 * Returns the type indicating where the token was found:
 * - 'env:GITLAB_TOKEN' for GITLAB_TOKEN env var
 * - 'env:GL_TOKEN' for GL_TOKEN env var
 * - 'none' if no token was found
 */
export function getGitLabTokenSource(): GitLabTokenSourceType {
  const result = resolveGitLabToken();
  return result.source;
}

/**
 * Check if GitLab is configured with a valid token.
 * @returns true if GitLab token is available
 */
export function isGitLabConfigured(): boolean {
  return resolveGitLabToken().token !== null;
}

// ============================================================================
// ACTIVE PROVIDER CONFIGURATION
// ============================================================================

/**
 * Get the active provider based on environment configuration.
 * Priority: GITLAB_TOKEN set → 'gitlab', otherwise → 'github' (default)
 */
export function getActiveProvider(): ProviderType {
  return isGitLabConfigured() ? 'gitlab' : 'github';
}

/**
 * Get active provider configuration for tool execution.
 * Returns provider type and base URL based on environment.
 */
export function getActiveProviderConfig(): {
  provider: ProviderType;
  baseUrl?: string;
  token?: string;
} {
  if (isGitLabConfigured()) {
    return {
      provider: 'gitlab',
      baseUrl: getGitLabHost(),
      token: getGitLabToken() ?? undefined,
    };
  }
  return {
    provider: 'github',
    baseUrl: process.env.GITHUB_API_URL?.trim() || undefined,
  };
}

/**
 * Check if the active provider is GitLab.
 */
export function isGitLabActive(): boolean {
  return getActiveProvider() === 'gitlab';
}
