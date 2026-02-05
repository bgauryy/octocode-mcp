/**
 * Default Configuration Values
 *
 * Used when ~/.octocode/.octocoderc is missing or fields are undefined.
 * These values provide safe, non-breaking defaults.
 */

import type {
  RequiredGitHubConfig,
  RequiredGitLabConfig,
  RequiredLocalConfig,
  RequiredToolsConfig,
  RequiredNetworkConfig,
  RequiredTelemetryConfig,
  RequiredLspConfig,
  RequiredSecurityConfig,
  ResolvedConfig,
} from './types.js';

// ============================================================================
// SECTION DEFAULTS
// ============================================================================

/**
 * Default GitHub configuration
 */
export const DEFAULT_GITHUB_CONFIG: RequiredGitHubConfig = {
  apiUrl: 'https://api.github.com',
};

/**
 * Default GitLab configuration
 */
export const DEFAULT_GITLAB_CONFIG: RequiredGitLabConfig = {
  host: 'https://gitlab.com',
};

/**
 * Default local tools configuration
 */
export const DEFAULT_LOCAL_CONFIG: RequiredLocalConfig = {
  enabled: true,
  allowedPaths: [],
  workspaceRoot: undefined,
};

/**
 * Default tools configuration
 */
export const DEFAULT_TOOLS_CONFIG: RequiredToolsConfig = {
  enabled: null,
  enableAdditional: null,
  disabled: null,
  disablePrompts: false,
};

/**
 * Default network configuration
 */
export const DEFAULT_NETWORK_CONFIG: RequiredNetworkConfig = {
  timeout: 30000,
  maxRetries: 3,
};

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: RequiredTelemetryConfig = {
  logging: true,
};

/**
 * Default LSP configuration
 */
export const DEFAULT_LSP_CONFIG: RequiredLspConfig = {
  configPath: undefined,
  forceMcpLsp: false,
};

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: RequiredSecurityConfig = {
  redactErrorPaths: false,
};

// ============================================================================
// COMPLETE DEFAULT CONFIG
// ============================================================================

/**
 * Complete default configuration
 * Used as fallback when .octocoderc is missing or invalid
 */
export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'source' | 'configPath'> = {
  version: 1,
  github: DEFAULT_GITHUB_CONFIG,
  gitlab: DEFAULT_GITLAB_CONFIG,
  local: DEFAULT_LOCAL_CONFIG,
  tools: DEFAULT_TOOLS_CONFIG,
  network: DEFAULT_NETWORK_CONFIG,
  telemetry: DEFAULT_TELEMETRY_CONFIG,
  lsp: DEFAULT_LSP_CONFIG,
  security: DEFAULT_SECURITY_CONFIG,
};

// ============================================================================
// CONFIGURATION LIMITS
// ============================================================================

/** Minimum timeout - 5 seconds (prevents accidental misconfiguration) */
export const MIN_TIMEOUT = 5000;

/** Maximum timeout - 5 minutes */
export const MAX_TIMEOUT = 300000;

/** Minimum retries */
export const MIN_RETRIES = 0;

/** Maximum retries */
export const MAX_RETRIES = 10;
