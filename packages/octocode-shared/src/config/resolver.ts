/**
 * Configuration Resolver — Public API barrel
 *
 * Re-exports resolution and cache functions from resolverCache.ts.
 * Also provides the getConfigValue() convenience accessor.
 */

// ============================================================================
// RE-EXPORTS FROM RESOLVER CACHE (resolution + cache in one module)
// ============================================================================

export {
  resolveConfigSync,
  resolveConfig,
  getConfig,
  getConfigSync,
  reloadConfig,
  invalidateConfigCache,
  _resetConfigCache,
  _getCacheState,
} from './resolverCache.js';

// ============================================================================
// CONVENIENCE ACCESSOR
// ============================================================================

import { getConfigSync } from './resolverCache.js';

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
