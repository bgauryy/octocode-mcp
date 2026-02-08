/**
 * Configuration Resolver
 *
 * Resolves final configuration by merging:
 * 1. Environment variables (highest priority)
 * 2. File configuration (~/.octocode/.octocoderc)
 * 3. Default values (lowest priority)
 */

import type { OctocodeConfig, ResolvedConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { loadConfigSync, configExists } from './loader.js';
import { validateConfig } from './validator.js';
import { createLogger } from '../logger/index.js';
import {
  resolveGitHub,
  resolveGitLab,
  resolveLocal,
  resolveTools,
  resolveNetwork,
  resolveTelemetry,
  resolveLsp,
} from './resolverSections.js';
import { getConfigSync } from './resolverCache.js';

const logger = createLogger('octocode-config');

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
    process.env.WORKSPACE_ROOT !== undefined ||
    process.env.ALLOWED_PATHS !== undefined ||
    process.env.TOOLS_TO_RUN !== undefined ||
    process.env.ENABLE_TOOLS !== undefined ||
    process.env.DISABLE_TOOLS !== undefined ||
    process.env.DISABLE_PROMPTS !== undefined ||
    process.env.REQUEST_TIMEOUT !== undefined ||
    process.env.MAX_RETRIES !== undefined ||
    process.env.LOG !== undefined ||
    process.env.OCTOCODE_LSP_CONFIG !== undefined;

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
        logger.warn(`Warning: ${warning}`);
      }
    }

    if (!validation.valid) {
      // Log errors and fall back to defaults — invalid config is not loaded
      for (const error of validation.errors) {
        logger.warn(`Validation error: ${error}`);
      }
      logger.warn(
        'Config file has validation errors — falling back to defaults with env overrides'
      );
      return buildResolvedConfig(undefined);
    }

    // Config is valid — build resolved config from file + defaults + env
    return buildResolvedConfig(loadResult.config, loadResult.path);
  }

  // No file or file error - use defaults with env overrides
  if (loadResult.error && configExists()) {
    // File exists but failed to parse - log warning
    logger.warn(loadResult.error);
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

// Re-export cache functions from resolverCache.ts
export {
  getConfig,
  getConfigSync,
  reloadConfig,
  invalidateConfigCache,
  _resetConfigCache,
  _getCacheState,
} from './resolverCache.js';

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
