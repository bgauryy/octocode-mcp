import type { ProviderType } from './providers/types.js';
import { getGithubCLIToken } from './utils/exec/index.js';
import {
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,
} from './utils/credentials/index.js';
import { getConfigSync, invalidateConfigCache } from 'octocode-shared';
import { version } from '../package.json';
import type { ServerConfig, TokenSourceType } from './types.js';
import { CONFIG_ERRORS } from './errorCodes.js';
import { maskSensitiveData } from './security/mask.js';
import {
  getGitLabConfig as resolveGitLabConfig,
  getGitLabToken,
  getGitLabHost,
  isGitLabConfigured,
} from './gitlabConfig.js';

// Re-export GitLab functions for API compatibility
export {
  getGitLabConfig,
  getGitLabToken,
  getGitLabHost,
  getGitLabTokenSource,
  isGitLabConfigured,
} from './gitlabConfig.js';

/** Result of token resolution with source tracking */
interface TokenResolutionResult {
  token: string | null;
  source: TokenSourceType;
}

let config: ServerConfig | null = null;
let initializationPromise: Promise<void> | null = null;

// Injectable function for testing (gh CLI is passed to resolveTokenFull)
let _getGithubCLIToken = getGithubCLIToken;

// Injectable resolveTokenFull for testing
type ResolveTokenFullFn = (options?: {
  hostname?: string;
  clientId?: string;
  getGhCliToken?: GhCliTokenGetter;
}) => Promise<FullTokenResolution | null>;
let _resolveTokenFull: ResolveTokenFullFn = resolveTokenFull;

/**
 * Maps source strings from octocode-shared to internal TokenSourceType.
 *
 * @param source - Source string from resolver ('env:*', 'gh-cli', 'file')
 */
function mapSharedSourceToInternal(
  source: string | null | undefined
): TokenSourceType {
  if (!source) return 'none';

  // Already prefixed env source
  if (source.startsWith('env:')) return source as TokenSourceType;

  // CLI source
  if (source === 'gh-cli') return 'gh-cli';

  // Storage sources
  if (source === 'file' || source === 'octocode-storage') {
    return 'octocode-storage';
  }

  return 'none';
}

/**
 * @internal - For testing only
 * Use `resolveTokenFull` to mock the entire resolution chain
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
 * @returns true, false, or undefined if not set/recognized
 */
function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return undefined;
  if (trimmed === 'true' || trimmed === '1') return true;
  if (trimmed === 'false' || trimmed === '0') return false;
  return undefined;
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

async function resolveGitHubToken(): Promise<TokenResolutionResult> {
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
  } catch {
    return { token: null, source: 'none' };
  }
}

// ============================================================================
// CONFIGURATION LIMITS
// ============================================================================

/** Minimum timeout - 5 seconds (prevents accidental misconfiguration) */
const MIN_TIMEOUT = 5000;
/** Maximum timeout - 5 minutes */
const MAX_TIMEOUT = 300000;
/** Minimum retries */
const MIN_RETRIES = 0;
/** Maximum retries */
const MAX_RETRIES_LIMIT = 10;

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

    // Parse LOG with special "default to true" semantics
    // LOG='anything' → true, LOG='false'/'0' → false, LOG=undefined → config fallback
    const envLogging = parseLoggingEnv(process.env.LOG);
    const isLoggingEnabled = envLogging ?? globalConfig.telemetry.logging;

    // Parse ENABLE_LOCAL from environment, then global config
    // Priority: ENABLE_LOCAL > config file > defaults
    const enableLocal =
      parseBooleanEnv(process.env.ENABLE_LOCAL) ?? globalConfig.local.enabled;

    // Parse DISABLE_PROMPTS - env var overrides global config
    const disablePrompts =
      parseBooleanEnv(process.env.DISABLE_PROMPTS) ??
      globalConfig.tools.disablePrompts ??
      false;

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
      enableTools:
        envEnableTools ?? globalConfig.tools.enableAdditional ?? undefined,
      disableTools: envDisableTools ?? globalConfig.tools.disabled ?? undefined,
      enableLogging: isLoggingEnabled,
      timeout,
      maxRetries,
      loggingEnabled: isLoggingEnabled,
      enableLocal,
      disablePrompts,
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

export function arePromptsEnabled(): boolean {
  return !(config?.disablePrompts ?? false);
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
