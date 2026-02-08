/**
 * Configuration cache management
 */

import type { ResolvedConfig } from './types.js';
import { resolveConfigSync } from './resolver.js';

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
// PUBLIC API
// ============================================================================

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
