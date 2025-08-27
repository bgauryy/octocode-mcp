import { getGithubCLIToken } from './utils/exec.js';
import { version } from '../package.json';

export interface ServerConfig {
  version: string;
  toolsToRun?: string[];
  enableTools?: string[];
  disableTools?: string[];
  enableLogging: boolean;
  betaEnabled: boolean;
  timeout: number;
  maxRetries: number;
}

// Simple module state
let config: ServerConfig | null = null;
let cachedToken: string | null = null;
let initialized = false;

/**
 * Parse comma-separated string to array
 */
function parseStringArray(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Get GitHub token from various sources
 */
async function resolveGitHubToken(): Promise<string | null> {
  // 1. Try GitHub CLI
  try {
    const cliToken = await getGithubCLIToken();
    if (cliToken?.trim()) {
      return cliToken.trim();
    }
  } catch {
    // CLI failed, continue
  }
  // 2. Try environment variables
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  return null;
}

/**
 * Initialize configuration and resolve token
 */
export async function initialize(): Promise<void> {
  if (initialized) return;

  // Resolve token
  cachedToken = await resolveGitHubToken();

  // Build config
  config = {
    version: version,
    toolsToRun: parseStringArray(process.env.TOOLS_TO_RUN),
    enableTools: parseStringArray(process.env.ENABLE_TOOLS),
    disableTools: parseStringArray(process.env.DISABLE_TOOLS),
    enableLogging: process.env.ENABLE_LOGGING === 'true',
    betaEnabled:
      process.env.BETA === '1' || process.env.BETA?.toLowerCase() === 'true',
    timeout: Math.max(
      30000,
      parseInt(process.env.REQUEST_TIMEOUT || '30000') || 30000
    ),
    maxRetries: Math.max(
      0,
      Math.min(10, parseInt(process.env.MAX_RETRIES || '3') || 3)
    ),
  };

  initialized = true;
}

/**
 * Reset configuration and clear cache
 */
export function cleanup(): void {
  config = null;
  cachedToken = null;
  initialized = false;
}

/**
 * Get server configuration
 */
export function getServerConfig(): ServerConfig {
  if (!config) {
    throw new Error('Configuration not initialized. Call initialize() first.');
  }
  return config;
}

/**
 * Get GitHub token
 */
export async function getGitHubToken(): Promise<string | null> {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  // Try to resolve token again
  cachedToken = await resolveGitHubToken();
  return cachedToken;
}

/**
 * Get GitHub token or throw error
 */
export async function getToken(): Promise<string> {
  const token = await getGitHubToken();
  if (!token) {
    throw new Error(
      'No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN/GH_TOKEN environment variable'
    );
  }
  return token;
}

/**
 * Check if beta features are enabled
 */
export function isBetaEnabled(): boolean {
  return getServerConfig().betaEnabled;
}

/**
 * Check if sampling features are enabled (requires BETA=1)
 */
export function isSamplingEnabled(): boolean {
  return isBetaEnabled();
}

/**
 * Clear cached token
 */
export function clearCachedToken(): void {
  cachedToken = null;
}

// Export for testing
export { parseStringArray };
