import { getGithubCLIToken } from './utils/exec/index.js';
import {
  resolveToken as resolveTokenImpl,
  type ResolvedToken,
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

// Injectable function for testing
let _resolveToken = resolveTokenImpl;

/**
 * @internal - For testing only
 */
export function _setResolveTokenFn(fn: typeof resolveTokenImpl): void {
  _resolveToken = fn;
}

/**
 * @internal - For testing only
 */
export function _resetResolveTokenFn(): void {
  _resolveToken = resolveTokenImpl;
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
  // Priority 1-5: Use octocode-shared's unified token resolution
  // Handles: env vars (OCTOCODE_TOKEN > GH_TOKEN > GITHUB_TOKEN) → keychain → file
  try {
    const resolved = await _resolveToken();
    if (resolved?.token) {
      return resolved.token;
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      error.message = maskSensitiveData(error.message);
    }
  }

  // Priority 6: GitHub CLI token (external fallback via `gh auth token`)
  try {
    const cliToken = await getGithubCLIToken();
    if (cliToken?.trim()) {
      return cliToken.trim();
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

export async function getToken(): Promise<string> {
  const token = await getGitHubToken();
  if (!token) {
    const sanitizedMessage = maskSensitiveData(
      CONFIG_ERRORS.NO_GITHUB_TOKEN.message
    );
    throw new Error(sanitizedMessage);
  }
  return token;
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
