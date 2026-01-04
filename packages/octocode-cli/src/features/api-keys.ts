/**
 * API Key Discovery and Management
 *
 * Discovers API keys from various installed AI clients:
 * - Environment variables (ANTHROPIC_API_KEY, etc.)
 * - OS Keychain (Claude Code OAuth tokens)
 * - Config files
 * - Manual entry with secure storage
 *
 * Best Practices:
 * - Prefer Claude Agent SDK which auto-handles auth
 * - Fall back to keychain discovery for direct API access
 * - Never log or expose actual key values
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AIProvider,
  APIKeyResult,
  APIKeySource,
  ClaudeCodeOAuthCredentials,
} from '../types/agent.js';
import { HOME, isMac, isWindows } from '../utils/platform.js';

// ============================================
// Environment Variable Checks
// ============================================

const ENV_VAR_MAP: Record<AIProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  bedrock: ['AWS_ACCESS_KEY_ID'], // Bedrock uses AWS credentials
  vertex: ['GOOGLE_APPLICATION_CREDENTIALS'], // Vertex uses GCP credentials
};

/**
 * Check environment variables for API keys
 */
export function getAPIKeyFromEnv(provider: AIProvider): APIKeyResult {
  const envVars = ENV_VAR_MAP[provider] || [];

  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value) {
      return {
        key: value,
        source: 'environment',
        provider,
      };
    }
  }

  return { key: null, source: 'none', provider };
}

// ============================================
// macOS Keychain Access
// ============================================

/**
 * Get Claude Code OAuth credentials from macOS Keychain
 * Claude Code stores OAuth tokens under "Claude Code-credentials"
 */
export function getClaudeCodeCredentials(): ClaudeCodeOAuthCredentials | null {
  if (!isMac) return null;

  try {
    const result = execSync(
      `security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (result) {
      return JSON.parse(result) as ClaudeCodeOAuthCredentials;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Check if Claude Code OAuth token is valid (not expired)
 */
export function isClaudeCodeTokenValid(
  creds: ClaudeCodeOAuthCredentials
): boolean {
  if (!creds.claudeAiOauth) return false;
  return creds.claudeAiOauth.expiresAt > Date.now();
}

/**
 * Get token expiration info
 */
export function getTokenExpirationInfo(creds: ClaudeCodeOAuthCredentials): {
  isExpired: boolean;
  expiresInMinutes: number;
} {
  if (!creds.claudeAiOauth) {
    return { isExpired: true, expiresInMinutes: 0 };
  }

  const expiresAt = creds.claudeAiOauth.expiresAt;
  const now = Date.now();
  const expiresInMinutes = Math.round((expiresAt - now) / 1000 / 60);

  return {
    isExpired: expiresAt <= now,
    expiresInMinutes,
  };
}

/**
 * Get API key from macOS Keychain (Claude Code OAuth)
 */
export function getAPIKeyFromKeychain(provider: AIProvider): APIKeyResult {
  if (!isMac) {
    return { key: null, source: 'none', provider };
  }

  if (provider === 'anthropic') {
    const creds = getClaudeCodeCredentials();

    if (creds?.claudeAiOauth && isClaudeCodeTokenValid(creds)) {
      return {
        key: creds.claudeAiOauth.accessToken,
        source: 'keychain-oauth',
        provider,
        expiresAt: creds.claudeAiOauth.expiresAt,
        isOAuth: true,
        scopes: creds.claudeAiOauth.scopes,
      };
    }
  }

  // Try generic keychain entries
  const keychainServices: Record<AIProvider, string[]> = {
    anthropic: ['anthropic-api-key', 'claude-api-key'],
    openai: ['openai-api-key'],
    google: ['google-api-key', 'gemini-api-key'],
    bedrock: [],
    vertex: [],
  };

  const services = keychainServices[provider] || [];

  for (const service of services) {
    try {
      const result = execSync(
        `security find-generic-password -s "${service}" -w 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      if (result) {
        return {
          key: result,
          source: 'keychain',
          provider,
        };
      }
    } catch {
      continue;
    }
  }

  return { key: null, source: 'none', provider };
}

// ============================================
// Windows Credential Manager
// ============================================

/**
 * Get API key from Windows Credential Manager
 * Note: Windows doesn't store Claude Code creds in an easily accessible way
 */
export function getAPIKeyFromWindowsCredentials(
  provider: AIProvider
): APIKeyResult {
  if (!isWindows) {
    return { key: null, source: 'none', provider };
  }

  // Windows credential access is complex - for now, rely on env vars
  // The Claude Agent SDK handles this automatically when Claude Code is installed
  return { key: null, source: 'none', provider };
}

// ============================================
// Config File Checks
// ============================================

/**
 * Get API key from config files
 * Checks common locations for API key configuration
 */
export function getAPIKeyFromConfigFile(provider: AIProvider): APIKeyResult {
  const configLocations: Record<AIProvider, string[]> = {
    anthropic: [
      join(HOME, '.anthropic', 'credentials'),
      join(HOME, '.config', 'anthropic', 'credentials'),
    ],
    openai: [
      join(HOME, '.openai', 'credentials'),
      join(HOME, '.config', 'openai', 'credentials'),
    ],
    google: [
      join(HOME, '.config', 'gcloud', 'application_default_credentials.json'),
    ],
    bedrock: [join(HOME, '.aws', 'credentials')],
    vertex: [],
  };

  const locations = configLocations[provider] || [];

  for (const configPath of locations) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');

        // Try JSON format
        try {
          const json = JSON.parse(content);
          const key =
            json.api_key || json.apiKey || json.access_key || json.accessKey;
          if (key) {
            return {
              key,
              source: 'config-file',
              provider,
            };
          }
        } catch {
          // Not JSON, try line-based format
          const lines = content.split('\n');
          for (const line of lines) {
            const match = line.match(/^\s*(api_key|apiKey)\s*=\s*(.+)\s*$/);
            if (match) {
              return {
                key: match[2].trim(),
                source: 'config-file',
                provider,
              };
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  return { key: null, source: 'none', provider };
}

// ============================================
// Main API Key Discovery
// ============================================

/**
 * Discover API key from all available sources
 * Priority: Environment > Keychain > Config File
 */
export async function discoverAPIKey(
  provider: AIProvider
): Promise<APIKeyResult> {
  // 1. Check environment variables first (most explicit)
  const envResult = getAPIKeyFromEnv(provider);
  if (envResult.key) {
    return envResult;
  }

  // 2. Check OS keychain (Claude Code OAuth tokens, etc.)
  if (isMac) {
    const keychainResult = getAPIKeyFromKeychain(provider);
    if (keychainResult.key) {
      return keychainResult;
    }
  } else if (isWindows) {
    const windowsResult = getAPIKeyFromWindowsCredentials(provider);
    if (windowsResult.key) {
      return windowsResult;
    }
  }

  // 3. Check config files
  const configResult = getAPIKeyFromConfigFile(provider);
  if (configResult.key) {
    return configResult;
  }

  return { key: null, source: 'none', provider };
}

/**
 * Detect all available providers with valid credentials
 */
export async function detectAvailableProviders(): Promise<AIProvider[]> {
  const providers: AIProvider[] = ['anthropic', 'openai', 'google'];
  const available: AIProvider[] = [];

  for (const provider of providers) {
    const result = await discoverAPIKey(provider);
    if (result.key) {
      available.push(provider);
    }
  }

  return available;
}

/**
 * Check if Claude Code is installed and authenticated
 */
export function isClaudeCodeAuthenticated(): boolean {
  const creds = getClaudeCodeCredentials();
  return creds !== null && isClaudeCodeTokenValid(creds);
}

/**
 * Get Claude Code subscription info
 */
export function getClaudeCodeSubscriptionInfo(): {
  isAuthenticated: boolean;
  subscriptionType?: string;
  rateLimitTier?: string;
  expiresInMinutes?: number;
} {
  const creds = getClaudeCodeCredentials();

  if (!creds?.claudeAiOauth) {
    return { isAuthenticated: false };
  }

  const { isExpired, expiresInMinutes } = getTokenExpirationInfo(creds);

  if (isExpired) {
    return { isAuthenticated: false };
  }

  return {
    isAuthenticated: true,
    subscriptionType: creds.claudeAiOauth.subscriptionType,
    rateLimitTier: creds.claudeAiOauth.rateLimitTier,
    expiresInMinutes,
  };
}

// ============================================
// Secure Storage (using octocode's token storage)
// ============================================

import { storeCredentials, getCredentials } from '../utils/token-storage.js';
import type { StoredCredentials, OAuthToken } from '../types/index.js';

/**
 * Store API key securely using octocode's token storage
 */
export async function storeAPIKey(
  provider: AIProvider,
  apiKey: string
): Promise<boolean> {
  try {
    const credentials: StoredCredentials = {
      hostname: `api.${provider}.com`,
      username: provider,
      token: {
        token: apiKey,
        tokenType: 'oauth' as const,
      } as OAuthToken,
      gitProtocol: 'https',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await storeCredentials(credentials);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Get stored API key from octocode's secure storage
 */
export async function getStoredAPIKey(
  provider: AIProvider
): Promise<string | null> {
  try {
    const credentials = await getCredentials(`api.${provider}.com`);
    return credentials?.token?.token || null;
  } catch {
    return null;
  }
}

// ============================================
// Display Helpers
// ============================================

/**
 * Mask API key for display (show first 6 and last 4 chars)
 */
export function maskAPIKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Get human-readable source description
 */
export function getSourceDescription(source: APIKeySource): string {
  switch (source) {
    case 'environment':
      return 'environment variable';
    case 'keychain':
      return 'OS keychain';
    case 'keychain-oauth':
      return 'Claude Code (OAuth)';
    case 'config-file':
      return 'config file';
    case 'manual':
      return 'manually entered';
    case 'none':
      return 'not found';
    default:
      return source;
  }
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic (Claude)';
    case 'openai':
      return 'OpenAI (GPT)';
    case 'google':
      return 'Google (Gemini)';
    case 'bedrock':
      return 'AWS Bedrock';
    case 'vertex':
      return 'Google Vertex AI';
    default:
      return provider;
  }
}
