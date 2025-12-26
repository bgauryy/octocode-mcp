import { getGithubCLIToken } from './utils/exec.js';
import { version } from '../package.json';
import type { ServerConfig } from './types.js';
import { CONFIG_ERRORS } from './errorCodes.js';
import { maskSensitiveData } from './security/mask.js';

let config: ServerConfig | null = null;
let cachedToken: string | null = null;
let initializationPromise: Promise<void> | null = null;

function parseStringArray(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function resolveGitHubToken(): Promise<string | null> {
  // Priority 1: Explicit GITHUB_TOKEN environment variable
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Priority 2: GitHub CLI token (fallback for convenience)
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

    const isLoggingEnabled =
      process.env.LOG === undefined ||
      process.env.LOG === null ||
      process.env.LOG?.toLowerCase() !== 'false';

    config = {
      version: version,
      githubApiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
      toolsToRun: parseStringArray(process.env.TOOLS_TO_RUN),
      enableTools: parseStringArray(process.env.ENABLE_TOOLS),
      disableTools: parseStringArray(process.env.DISABLE_TOOLS),
      enableLogging: isLoggingEnabled,
      timeout: Math.max(
        30000,
        parseInt(process.env.REQUEST_TIMEOUT || '30000') || 30000
      ),
      maxRetries: Math.max(
        0,
        Math.min(10, parseInt(process.env.MAX_RETRIES || '3') || 3)
      ),
      loggingEnabled: isLoggingEnabled,
      enableLocal:
        process.env.ENABLE_LOCAL === '1' ||
        process.env.ENABLE_LOCAL?.toLowerCase() === 'true',
    };
  })();

  await initializationPromise;
}

export function cleanup(): void {
  config = null;
  cachedToken = null;
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

export async function getGitHubToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken;
  }

  cachedToken = await resolveGitHubToken();
  return cachedToken;
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

export function clearCachedToken(): void {
  cachedToken = null;
}

export { parseStringArray };
