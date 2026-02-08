/**
 * Global Configuration Module
 *
 * Provides global control over Octocode execution via ~/.octocode/.octocoderc file.
 *
 * @example
 * ```typescript
 * import { getConfig, getConfigSync, reloadConfig } from 'octocode-shared';
 *
 * // Async (recommended)
 * const config = await getConfig();
 * console.log(config.github.apiUrl);  // 'https://api.github.com'
 * console.log(config.local.enabled);  // true (or false if ENABLE_LOCAL=false)
 *
 * // Sync (for hot paths)
 * const config = getConfigSync();
 *
 * // Force reload from disk
 * const freshConfig = await reloadConfig();
 * ```
 *
 * Resolution Priority:
 * 1. Environment variables (highest - always wins)
 * 2. ~/.octocode/.octocoderc file
 * 3. Hardcoded defaults (lowest)
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Main config types
  OctocodeConfig,
  ResolvedConfig,
  ValidationResult,
  LoadConfigResult,

  // Section types (raw)
  GitHubConfigOptions,
  GitLabConfigOptions,
  LocalConfigOptions,
  ToolsConfigOptions,
  NetworkConfigOptions,
  TelemetryConfigOptions,
  LspConfigOptions,

  // Section types (resolved)
  RequiredGitHubConfig,
  RequiredGitLabConfig,
  RequiredLocalConfig,
  RequiredToolsConfig,
  RequiredNetworkConfig,
  RequiredTelemetryConfig,
  RequiredLspConfig,
} from './types.js';

// ============================================================================
// CONSTANT EXPORTS
// ============================================================================

export { CONFIG_SCHEMA_VERSION, CONFIG_FILE_NAME } from './types.js';

export {
  // Default configs
  DEFAULT_CONFIG,
  DEFAULT_GITHUB_CONFIG,
  DEFAULT_GITLAB_CONFIG,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_NETWORK_CONFIG,
  DEFAULT_TELEMETRY_CONFIG,
  DEFAULT_LSP_CONFIG,

  // Limits
  MIN_TIMEOUT,
  MAX_TIMEOUT,
  MIN_RETRIES,
  MAX_RETRIES,
} from './defaults.js';

export { CONFIG_FILE_PATH } from './loader.js';
// Note: OCTOCODE_DIR is already exported from credentials module

// ============================================================================
// FUNCTION EXPORTS
// ============================================================================

// Loader functions
export {
  loadConfig,
  loadConfigSync,
  configExists,
  getConfigPath,
  getOctocodeDir,
} from './loader.js';

// Validator functions
export { validateConfig } from './validator.js';

// Resolver functions (main API)
export {
  getConfig,
  getConfigSync,
  reloadConfig,
  resolveConfig,
  resolveConfigSync,
  invalidateConfigCache,
  getConfigValue,

  // Testing utilities
  _resetConfigCache,
  _getCacheState,
} from './resolver.js';

// Schemas
export { OctocodeConfigSchema } from './schemas.js';
