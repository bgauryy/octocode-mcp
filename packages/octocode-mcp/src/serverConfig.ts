import type { ProviderType } from './providers/types.js';
import { getGithubCLIToken } from './utils/exec/index.js';
import {
  getEnvTokenSource,
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,
} from './utils/credentials/index.js';
import { getConfigSync, invalidateConfigCache } from 'octocode-shared';
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
 * - octocode-shared: 'env:*', 'gh-cli', 'file'
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

  // Storage sources (file, octocode variants)
  if (['file', 'octocode', 'octocode-storage'].includes(source)) {
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
  if (trimmed === 'true' || trimmed === '1') return true;
  if (trimmed === 'false' || trimmed === '0') return false;
  // Unrecognized values fall back to default (allows ?? to work)
  return defaultValue;
}

/**
 * Parse LOG env var with "default to true" semantics.
 * Returns true unless explicitly set to 'false' or '0'.
 * Returns undefined if not set (to allow config fallback).
 * @param value - The LOG environment variable value
 * @returns true, false, or undefined for fallback
 */
function parseLoggingEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return undefined;
  // Only return false if explicitly set to 'false' or '0'
  if (trimmed === 'false' || trimmed === '0') return false;
  // Any other value (including 'true', '1', 'yes', 'anything') means enabled
  return true;
}

/** Check if debug logging is enabled via environment variable */
const isDebugEnabled = () =>
  process.env.OCTOCODE_DEBUG === 'true' ||
  process.env.DEBUG?.includes('octocode');

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
      const maskedMsg =
        error instanceof Error
          ? maskSensitiveData(error.message)
          : 'Unknown error';
      if (isDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.debug('[octocode] Legacy token resolution failed:', maskedMsg);
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
    const maskedMsg =
      error instanceof Error
        ? maskSensitiveData(error.message)
        : 'Unknown error';
    if (isDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.debug('[octocode] Token resolution failed:', maskedMsg);
    }
    return { token: null, source: 'none' };
  }
}

// ============================================================================
// GITLAB TOKEN RESOLUTION
// ============================================================================

// ============================================================================
// CONFIGURATION LIMITS (from octocode-shared/config)
// These are kept as constants for clamping, actual defaults come from getConfigSync()
// ============================================================================

/** Minimum timeout - 5 seconds (prevents accidental misconfiguration) */
const MIN_TIMEOUT = 5000;
/** Maximum timeout - 5 minutes */
const MAX_TIMEOUT = 300000;
/** Minimum retries */
const MIN_RETRIES = 0;
/** Maximum retries */
const MAX_RETRIES_LIMIT = 10;

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
 * Resolve GitLab configuration from environment variables and global config.
 * Priority: env vars > ~/.octocode/.octocoderc > hardcoded defaults
 * @returns GitLab configuration object
 */
function resolveGitLabConfig(): GitLabConfig {
  const globalConfig = getConfigSync();
  const tokenResult = resolveGitLabToken();
  const host = process.env.GITLAB_HOST?.trim() || globalConfig.gitlab.host;

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
    // Load global configuration from ~/.octocode/.octocoderc
    // This provides defaults that can be overridden by environment variables
    const globalConfig = getConfigSync();

    // Resolve token once at startup for initial config (source tracking)
    // Token is NOT cached - subsequent calls to getGitHubToken() will re-resolve
    const tokenResult = await resolveGitHubToken();

    // Parse logging flag - env vars override global config
    // Priority: OCTOCODE_TELEMETRY_DISABLED > LOG env var > config file > defaults
    const envTelemetryDisabled = parseBooleanEnv(
      process.env.OCTOCODE_TELEMETRY_DISABLED,
      undefined as unknown as boolean
    );
    const telemetryDisabled =
      envTelemetryDisabled ?? !globalConfig.telemetry.enabled;

    // Parse LOG with special "default to true" semantics
    // LOG='anything' → true, LOG='false'/'0' → false, LOG=undefined → config fallback
    const envLogging = parseLoggingEnv(process.env.LOG);
    const isLoggingEnabled =
      !telemetryDisabled && (envLogging ?? globalConfig.telemetry.logging);

    // Parse ENABLE_LOCAL with fallback to LOCAL env var, then global config
    // Priority: ENABLE_LOCAL > LOCAL > config file > defaults
    const envEnableLocal =
      parseBooleanEnv(
        process.env.ENABLE_LOCAL,
        undefined as unknown as boolean
      ) ?? parseBooleanEnv(process.env.LOCAL, undefined as unknown as boolean);
    const enableLocal = envEnableLocal ?? globalConfig.local.enabled;

    // Parse tools configuration - env vars override global config
    const envToolsToRun = parseStringArray(process.env.TOOLS_TO_RUN);
    const envEnableTools = parseStringArray(process.env.ENABLE_TOOLS);
    const envDisableTools = parseStringArray(process.env.DISABLE_TOOLS);

    // Parse timeout - env var overrides global config
    const envTimeout = process.env.REQUEST_TIMEOUT?.trim();
    const timeout = Math.max(
      MIN_TIMEOUT,
      Math.min(
        MAX_TIMEOUT,
        envTimeout
          ? parseInt(envTimeout) || globalConfig.network.timeout
          : globalConfig.network.timeout
      )
    );

    // Parse retries - env var overrides global config
    const envRetries = process.env.MAX_RETRIES?.trim();
    const maxRetries = Math.max(
      MIN_RETRIES,
      Math.min(
        MAX_RETRIES_LIMIT,
        envRetries
          ? parseInt(envRetries) || globalConfig.network.maxRetries
          : globalConfig.network.maxRetries
      )
    );

    config = {
      version: version,
      githubApiUrl:
        process.env.GITHUB_API_URL?.trim() || globalConfig.github.apiUrl,
      toolsToRun: envToolsToRun ?? globalConfig.tools.enabled ?? undefined,
      enableTools: envEnableTools ?? undefined,
      disableTools: envDisableTools ?? globalConfig.tools.disabled ?? undefined,
      enableLogging: isLoggingEnabled,
      timeout,
      maxRetries,
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
  invalidateConfigCache(); // Reset shared config cache to pick up new defaults/env vars
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
 * Priority: env var > config file > default
 * @returns GitLab host URL (defaults to https://gitlab.com)
 */
export function getGitLabHost(): string {
  const globalConfig = getConfigSync();
  return process.env.GITLAB_HOST?.trim() || globalConfig.gitlab.host;
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
 * Returns provider type and base URL based on environment and global config.
 * Priority: env vars > config file > defaults
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
  const globalConfig = getConfigSync();
  const githubApiUrl =
    process.env.GITHUB_API_URL?.trim() || globalConfig.github.apiUrl;
  // Only set baseUrl if it's not the default
  const baseUrl =
    githubApiUrl !== 'https://api.github.com' ? githubApiUrl : undefined;
  return {
    provider: 'github',
    baseUrl,
  };
}

/**
 * Check if the active provider is GitLab.
 */
export function isGitLabActive(): boolean {
  return getActiveProvider() === 'gitlab';
}
