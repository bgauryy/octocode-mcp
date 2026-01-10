import { getGithubCLIToken } from './utils/exec/index.js';
import {
  getEnvTokenSource,
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,
} from './utils/credentials/index.js';
import { initializeSecureStorage } from 'octocode-shared';
import { version } from '../package.json';
import type { ServerConfig, TokenSourceType } from './types.js';
import { CONFIG_ERRORS } from './errorCodes.js';
import { maskSensitiveData } from './security/mask.js';

/** Result of token resolution with source tracking */
interface TokenResolutionResult {
  token: string | null;
  source: TokenSourceType;
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
 * Maps shared token source types to internal TokenSourceType.
 * - 'env:*' → same (env:OCTOCODE_TOKEN, env:GH_TOKEN, env:GITHUB_TOKEN)
 * - 'keychain' | 'file' → 'octocode-storage'
 * - 'gh-cli' → 'gh-cli'
 * - null → 'none'
 */
function mapSharedSourceToInternal(
  source: string | null | undefined
): TokenSourceType {
  if (!source) return 'none';
  if (source.startsWith('env:')) return source as TokenSourceType;
  if (source === 'gh-cli') return 'gh-cli';
  if (source === 'keychain' || source === 'file') return 'octocode-storage';
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
        // Map legacy source format to new TokenSourceType
        let source: TokenSourceType = 'none';
        if (resolved.source?.startsWith('env:')) {
          source = resolved.source as TokenSourceType;
        } else if (resolved.source === 'env') {
          source =
            (getEnvTokenSource() as TokenSourceType) ?? 'env:GITHUB_TOKEN';
        } else if (resolved.source === 'gh-cli') {
          source = 'gh-cli';
        } else if (
          resolved.source === 'octocode' ||
          resolved.source === 'octocode-storage'
        ) {
          source = 'octocode-storage';
        }
        return { token: resolved.token, source };
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
    const isLoggingEnabled = parseBooleanEnvDefaultTrue(process.env.LOG);

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
        30000,
        parseInt(process.env.REQUEST_TIMEOUT?.trim() || '30000') || 30000
      ),
      maxRetries: Math.max(
        0,
        Math.min(10, parseInt(process.env.MAX_RETRIES?.trim() || '3') || 3)
      ),
      loggingEnabled: isLoggingEnabled,
      enableLocal,
      tokenSource: tokenResult.source,
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
