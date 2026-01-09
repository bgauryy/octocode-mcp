import { getGithubCLIToken } from './utils/exec/index.js';
import {
  getTokenFromEnv,
  getOctocodeToken,
} from './utils/credentials/index.js';
import { version } from '../package.json';
import type { ServerConfig } from './types.js';
import { CONFIG_ERRORS } from './errorCodes.js';
import { maskSensitiveData } from './security/mask.js';

let config: ServerConfig | null = null;
let cachedToken: string | null = null;
let initializationPromise: Promise<void> | null = null;
// Track pending token resolution to prevent race conditions
let pendingTokenPromise: Promise<string | null> | null = null;

// Injectable functions for testing
let _getTokenFromEnv = getTokenFromEnv;
let _getOctocodeToken = getOctocodeToken;
let _getGithubCLIToken = getGithubCLIToken;

// Legacy mock for backward compatibility with existing tests
// Maps { token, source } format to the new split functions
type ResolvedToken = { token: string; source: string } | null;
type ResolveTokenFn = () => Promise<ResolvedToken>;
let _legacyResolveToken: ResolveTokenFn | null = null;

/**
 * @internal - For testing only (NEW API)
 */
export function _setTokenResolvers(resolvers: {
  getTokenFromEnv?: typeof getTokenFromEnv;
  getOctocodeToken?: typeof getOctocodeToken;
  getGithubCLIToken?: typeof getGithubCLIToken;
}): void {
  if (resolvers.getTokenFromEnv) {
    _getTokenFromEnv = resolvers.getTokenFromEnv;
  }
  if (resolvers.getOctocodeToken) {
    _getOctocodeToken = resolvers.getOctocodeToken;
  }
  if (resolvers.getGithubCLIToken) {
    _getGithubCLIToken = resolvers.getGithubCLIToken;
  }
}

/**
 * @internal - For testing only (NEW API)
 */
export function _resetTokenResolvers(): void {
  _getTokenFromEnv = getTokenFromEnv;
  _getOctocodeToken = getOctocodeToken;
  _getGithubCLIToken = getGithubCLIToken;
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

async function resolveGitHubToken(): Promise<string | null> {
  // Support legacy test mock (backward compatibility)
  if (_legacyResolveToken) {
    try {
      const resolved = await _legacyResolveToken();
      return resolved?.token ?? null;
    } catch (error) {
      if (error instanceof Error && error.message) {
        error.message = maskSensitiveData(error.message);
      }
      return null;
    }
  }

  // Priority 1-3: Environment variables (fastest, no I/O)
  // OCTOCODE_TOKEN > GH_TOKEN > GITHUB_TOKEN
  const envToken = _getTokenFromEnv();
  if (envToken) {
    return envToken;
  }

  // Priority 4: GitHub CLI token via `gh auth token`
  // For users who have authenticated with `gh auth login`
  try {
    const cliToken = await _getGithubCLIToken();
    if (cliToken?.trim()) {
      return cliToken.trim();
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      error.message = maskSensitiveData(error.message);
    }
  }

  // Priority 5-6: Stored credentials (keychain → file)
  try {
    const storedToken = await _getOctocodeToken();
    if (storedToken) {
      return storedToken;
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      error.message = maskSensitiveData(error.message);
    }
  }

  return null;
}

export async function initialize(): Promise<void> {
  if (config !== null) {
    return;
  }
  if (initializationPromise !== null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    cachedToken = await resolveGitHubToken();

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
    };
  })();

  await initializationPromise;
}

export function cleanup(): void {
  config = null;
  cachedToken = null;
  initializationPromise = null;
  pendingTokenPromise = null;
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

export async function getGitHubToken(): Promise<string | null> {
  // Case 1: Token already cached
  if (cachedToken) {
    return cachedToken;
  }

  // Case 2: Token resolution already in progress (race condition protection)
  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  // Case 3: Start new token resolution
  pendingTokenPromise = (async () => {
    try {
      cachedToken = await resolveGitHubToken();
      return cachedToken;
    } finally {
      pendingTokenPromise = null;
    }
  })();

  return pendingTokenPromise;
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

export function clearConfigCachedToken(): void {
  cachedToken = null;
  pendingTokenPromise = null;
}
