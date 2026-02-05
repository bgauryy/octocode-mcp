/**
 * Configuration Resolver
 *
 * Resolves final configuration by merging:
 * 1. Environment variables (highest priority)
 * 2. File configuration (~/.octocode/.octocoderc)
 * 3. Default values (lowest priority)
 */

import type {
  OctocodeConfig,
  ResolvedConfig,
  RequiredGitHubConfig,
  RequiredGitLabConfig,
  RequiredLocalConfig,
  RequiredToolsConfig,
  RequiredNetworkConfig,
  RequiredTelemetryConfig,
  RequiredLspConfig,
  RequiredResearchConfig,
} from './types.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_GITHUB_CONFIG,
  DEFAULT_GITLAB_CONFIG,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_NETWORK_CONFIG,
  DEFAULT_TELEMETRY_CONFIG,
  DEFAULT_LSP_CONFIG,
  DEFAULT_RESEARCH_CONFIG,
  MIN_TIMEOUT,
  MAX_TIMEOUT,
  MIN_RETRIES,
  MAX_RETRIES,
} from './defaults.js';
import { loadConfigSync, configExists } from './loader.js';
import { validateConfig } from './validator.js';

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/** Cached resolved configuration */
let cachedConfig: ResolvedConfig | null = null;

/** Timestamp when config was cached */
let cacheTimestamp: number = 0;

/** Cache TTL in milliseconds (1 minute) */
const CACHE_TTL_MS = 60000;

// ============================================================================
// ENVIRONMENT VARIABLE PARSING
// ============================================================================

/**
 * Parse a boolean environment variable.
 *
 * @param value - Environment variable value
 * @returns Parsed boolean or undefined if not set
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
 * Parse an integer environment variable.
 *
 * @param value - Environment variable value
 * @returns Parsed integer or undefined if not set/invalid
 */
function parseIntEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) return undefined;
  return parsed;
}

/**
 * Parse a string array environment variable (comma-separated).
 *
 * @param value - Environment variable value
 * @returns Parsed string array or undefined if not set
 */
function parseStringArrayEnv(value: string | undefined): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ============================================================================
// SECTION RESOLVERS
// ============================================================================

/**
 * Resolve GitHub configuration.
 */
function resolveGitHub(
  fileConfig?: OctocodeConfig['github']
): RequiredGitHubConfig {
  // Env var: GITHUB_API_URL
  const envApiUrl = process.env.GITHUB_API_URL?.trim();

  return {
    apiUrl: envApiUrl || fileConfig?.apiUrl || DEFAULT_GITHUB_CONFIG.apiUrl,
    defaultOrg: fileConfig?.defaultOrg ?? DEFAULT_GITHUB_CONFIG.defaultOrg,
  };
}

/**
 * Resolve GitLab configuration.
 */
function resolveGitLab(
  fileConfig?: OctocodeConfig['gitlab']
): RequiredGitLabConfig {
  // Env var: GITLAB_HOST
  const envHost = process.env.GITLAB_HOST?.trim();

  return {
    host: envHost || fileConfig?.host || DEFAULT_GITLAB_CONFIG.host,
    defaultGroup:
      fileConfig?.defaultGroup ?? DEFAULT_GITLAB_CONFIG.defaultGroup,
  };
}

/**
 * Resolve local tools configuration.
 */
function resolveLocal(
  fileConfig?: OctocodeConfig['local']
): RequiredLocalConfig {
  // Env var: ENABLE_LOCAL
  const envEnableLocal = parseBooleanEnv(process.env.ENABLE_LOCAL);

  return {
    enabled:
      envEnableLocal ?? fileConfig?.enabled ?? DEFAULT_LOCAL_CONFIG.enabled,
    allowedPaths: fileConfig?.allowedPaths ?? DEFAULT_LOCAL_CONFIG.allowedPaths,
    excludePaths: fileConfig?.excludePaths ?? DEFAULT_LOCAL_CONFIG.excludePaths,
  };
}

/**
 * Resolve tools configuration.
 */
function resolveTools(
  fileConfig?: OctocodeConfig['tools']
): RequiredToolsConfig {
  // Env vars: TOOLS_TO_RUN, ENABLE_TOOLS, DISABLE_TOOLS
  const envToolsToRun = parseStringArrayEnv(process.env.TOOLS_TO_RUN);
  const envEnableTools = parseStringArrayEnv(process.env.ENABLE_TOOLS);
  const envDisableTools = parseStringArrayEnv(process.env.DISABLE_TOOLS);

  // TOOLS_TO_RUN and ENABLE_TOOLS both set 'enabled'
  const envEnabled = envToolsToRun ?? envEnableTools;

  return {
    enabled: envEnabled ?? fileConfig?.enabled ?? DEFAULT_TOOLS_CONFIG.enabled,
    disabled:
      envDisableTools ?? fileConfig?.disabled ?? DEFAULT_TOOLS_CONFIG.disabled,
  };
}

/**
 * Resolve network configuration.
 */
function resolveNetwork(
  fileConfig?: OctocodeConfig['network']
): RequiredNetworkConfig {
  // Env vars: REQUEST_TIMEOUT, MAX_RETRIES
  const envTimeout = parseIntEnv(process.env.REQUEST_TIMEOUT);
  const envMaxRetries = parseIntEnv(process.env.MAX_RETRIES);

  // Clamp values to valid ranges
  let timeout =
    envTimeout ?? fileConfig?.timeout ?? DEFAULT_NETWORK_CONFIG.timeout;
  timeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, timeout));

  let maxRetries =
    envMaxRetries ??
    fileConfig?.maxRetries ??
    DEFAULT_NETWORK_CONFIG.maxRetries;
  maxRetries = Math.max(MIN_RETRIES, Math.min(MAX_RETRIES, maxRetries));

  return { timeout, maxRetries };
}

/**
 * Resolve telemetry configuration.
 */
function resolveTelemetry(
  fileConfig?: OctocodeConfig['telemetry']
): RequiredTelemetryConfig {
  // Env var: LOG
  const envLogging = parseBooleanEnv(process.env.LOG);

  return {
    enabled: fileConfig?.enabled ?? DEFAULT_TELEMETRY_CONFIG.enabled,
    logging:
      envLogging ?? fileConfig?.logging ?? DEFAULT_TELEMETRY_CONFIG.logging,
  };
}

/**
 * Resolve LSP configuration.
 */
function resolveLsp(fileConfig?: OctocodeConfig['lsp']): RequiredLspConfig {
  return {
    enabled: fileConfig?.enabled ?? DEFAULT_LSP_CONFIG.enabled,
    timeout: fileConfig?.timeout ?? DEFAULT_LSP_CONFIG.timeout,
    languages: fileConfig?.languages ?? DEFAULT_LSP_CONFIG.languages,
  };
}

/**
 * Resolve research configuration.
 */
function resolveResearch(
  fileConfig?: OctocodeConfig['research']
): RequiredResearchConfig {
  return {
    defaultProvider:
      fileConfig?.defaultProvider ?? DEFAULT_RESEARCH_CONFIG.defaultProvider,
    maxQueriesPerBatch:
      fileConfig?.maxQueriesPerBatch ??
      DEFAULT_RESEARCH_CONFIG.maxQueriesPerBatch,
    maxResultsPerQuery:
      fileConfig?.maxResultsPerQuery ??
      DEFAULT_RESEARCH_CONFIG.maxResultsPerQuery,
  };
}

// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Build resolved configuration from file config and environment.
 *
 * @param fileConfig - Configuration loaded from file (optional)
 * @param configPath - Path to config file (if loaded)
 * @returns Fully resolved configuration
 */
function buildResolvedConfig(
  fileConfig: OctocodeConfig | undefined,
  configPath?: string
): ResolvedConfig {
  const hasFile = fileConfig !== undefined;
  const hasEnvOverrides =
    process.env.GITHUB_API_URL !== undefined ||
    process.env.GITLAB_HOST !== undefined ||
    process.env.ENABLE_LOCAL !== undefined ||
    process.env.TOOLS_TO_RUN !== undefined ||
    process.env.ENABLE_TOOLS !== undefined ||
    process.env.DISABLE_TOOLS !== undefined ||
    process.env.REQUEST_TIMEOUT !== undefined ||
    process.env.MAX_RETRIES !== undefined ||
    process.env.LOG !== undefined;

  // Determine source
  let source: ResolvedConfig['source'];
  if (hasFile && hasEnvOverrides) {
    source = 'mixed';
  } else if (hasFile) {
    source = 'file';
  } else {
    source = 'defaults';
  }

  return {
    version: fileConfig?.version ?? DEFAULT_CONFIG.version,
    github: resolveGitHub(fileConfig?.github),
    gitlab: resolveGitLab(fileConfig?.gitlab),
    local: resolveLocal(fileConfig?.local),
    tools: resolveTools(fileConfig?.tools),
    network: resolveNetwork(fileConfig?.network),
    telemetry: resolveTelemetry(fileConfig?.telemetry),
    lsp: resolveLsp(fileConfig?.lsp),
    research: resolveResearch(fileConfig?.research),
    source,
    configPath: hasFile ? configPath : undefined,
  };
}

/**
 * Resolve configuration synchronously.
 * Loads from file, applies env overrides, returns with defaults.
 *
 * @returns Fully resolved configuration
 */
export function resolveConfigSync(): ResolvedConfig {
  // Try to load config file
  const loadResult = loadConfigSync();

  if (loadResult.success && loadResult.config) {
    // Validate loaded config
    const validation = validateConfig(loadResult.config);

    if (validation.warnings.length > 0) {
      // Log warnings but continue
      for (const warning of validation.warnings) {
        console.warn(`[octocode-config] Warning: ${warning}`);
      }
    }

    if (!validation.valid) {
      // Log errors and fall back to defaults for invalid fields
      for (const error of validation.errors) {
        console.warn(`[octocode-config] Validation error: ${error}`);
      }
    }

    // Build resolved config (validation errors don't prevent loading valid fields)
    return buildResolvedConfig(loadResult.config, loadResult.path);
  }

  // No file or file error - use defaults with env overrides
  if (loadResult.error && configExists()) {
    // File exists but failed to parse - log warning
    console.warn(`[octocode-config] ${loadResult.error}`);
  }

  return buildResolvedConfig(undefined);
}

/**
 * Resolve configuration asynchronously.
 * Currently just wraps sync version, but allows for future async operations.
 *
 * @returns Promise resolving to fully resolved configuration
 */
export async function resolveConfig(): Promise<ResolvedConfig> {
  return resolveConfigSync();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get fully resolved configuration (async).
 * Loads from file, applies env overrides, returns with defaults.
 *
 * Results are cached for performance - call reloadConfig() to refresh.
 *
 * @example
 * ```typescript
 * const config = await getConfig();
 * console.log(config.github.apiUrl); // 'https://api.github.com'
 * console.log(config.local.enabled); // true (or false if ENABLE_LOCAL=false)
 * ```
 */
export async function getConfig(): Promise<ResolvedConfig> {
  return getConfigSync();
}

/**
 * Get fully resolved configuration (sync).
 * Uses cached config if available and not expired.
 *
 * @example
 * ```typescript
 * const config = getConfigSync();
 * if (config.local.enabled) {
 *   // Local tools are enabled
 * }
 * ```
 */
export function getConfigSync(): ResolvedConfig {
  const now = Date.now();

  // Return cached if still valid
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // Resolve fresh config
  cachedConfig = resolveConfigSync();
  cacheTimestamp = now;

  return cachedConfig;
}

/**
 * Reload configuration from disk, bypassing cache.
 * Useful when config file has been modified.
 *
 * @returns Fresh resolved configuration
 */
export async function reloadConfig(): Promise<ResolvedConfig> {
  invalidateConfigCache();
  return getConfig();
}

/**
 * Invalidate the configuration cache.
 * Next call to getConfig/getConfigSync will reload from disk.
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Get a specific configuration value by path.
 *
 * @param path - Dot-separated path (e.g., 'github.apiUrl', 'local.enabled')
 * @returns Configuration value or undefined if not found
 *
 * @example
 * ```typescript
 * const apiUrl = getConfigValue('github.apiUrl'); // 'https://api.github.com'
 * const enabled = getConfigValue('local.enabled'); // true
 * ```
 */
export function getConfigValue<T = unknown>(path: string): T | undefined {
  const config = getConfigSync();
  const parts = path.split('.');

  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current as T;
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * @internal - For testing only
 * Reset the configuration cache
 */
export function _resetConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * @internal - For testing only
 * Get cache state for assertions
 */
export function _getCacheState(): { cached: boolean; timestamp: number } {
  return {
    cached: cachedConfig !== null,
    timestamp: cacheTimestamp,
  };
}
