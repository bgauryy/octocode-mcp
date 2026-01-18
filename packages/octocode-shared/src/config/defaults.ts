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
  RequiredResearchConfig,
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
  defaultOrg: undefined,
};

/**
 * Default GitLab configuration
 */
export const DEFAULT_GITLAB_CONFIG: RequiredGitLabConfig = {
  host: 'https://gitlab.com',
  defaultGroup: undefined,
};

/**
 * Default local tools configuration
 */
export const DEFAULT_LOCAL_CONFIG: RequiredLocalConfig = {
  enabled: false,
  allowedPaths: [],
  excludePaths: [
    'node_modules',
    '.git',
    'dist',
    'coverage',
    '__pycache__',
    '.venv',
    'venv',
  ],
};

/**
 * Default tools configuration
 */
export const DEFAULT_TOOLS_CONFIG: RequiredToolsConfig = {
  enabled: null,
  disabled: null,
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
  enabled: true,
  logging: true,
};

/**
 * Default LSP configuration
 */
export const DEFAULT_LSP_CONFIG: RequiredLspConfig = {
  enabled: true,
  timeout: 10000,
  languages: {},
};

/**
 * Default research configuration
 */
export const DEFAULT_RESEARCH_CONFIG: RequiredResearchConfig = {
  defaultProvider: 'github',
  maxQueriesPerBatch: 3,
  maxResultsPerQuery: 10,
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
  research: DEFAULT_RESEARCH_CONFIG,
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

/** Minimum queries per batch */
export const MIN_QUERIES_PER_BATCH = 1;

/** Maximum queries per batch */
export const MAX_QUERIES_PER_BATCH = 10;

/** Minimum results per query */
export const MIN_RESULTS_PER_QUERY = 1;

/** Maximum results per query */
export const MAX_RESULTS_PER_QUERY = 100;

/** LSP minimum timeout */
export const LSP_MIN_TIMEOUT = 1000;

/** LSP maximum timeout */
export const LSP_MAX_TIMEOUT = 60000;
