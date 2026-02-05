/**
 * Provider Factory
 *
 * Creates and caches provider instances based on type and configuration.
 * Supports dynamic provider registration and instance caching per token/baseUrl.
 *
 * @module providers/factory
 */

import type {
  ICodeHostProvider,
  ProviderType,
  ProviderConfig,
} from './types.js';
import { createHash } from 'crypto';

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/** Provider cache TTL (1 hour) - providers are re-created after this time */
const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Registry of provider classes by type.
 * Providers register themselves during module initialization.
 */
const providerRegistry = new Map<
  ProviderType,
  new (config?: ProviderConfig) => ICodeHostProvider
>();

/**
 * Cached provider entry with TTL tracking.
 */
interface CachedProvider {
  provider: ICodeHostProvider;
  createdAt: number;
}

/**
 * Cache of provider instances with TTL.
 * Key format: `${type}:${baseUrl}:${tokenHash}`
 */
const instanceCache = new Map<string, CachedProvider>();

/**
 * Check if a cached provider entry is still valid (not expired).
 */
function isProviderCacheValid(entry: CachedProvider): boolean {
  return Date.now() - entry.createdAt < PROVIDER_CACHE_TTL_MS;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash a token for cache key generation.
 * Never stores raw tokens in cache keys.
 */
function hashToken(token?: string): string {
  if (!token) return 'default';
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * Normalize URL for consistent cache keys.
 * - Removes trailing slashes
 * - Lowercases hostname
 * - Removes default ports (443 for https, 80 for http)
 */
function normalizeUrl(url: string): string {
  if (url === 'default') return url;

  try {
    const parsed = new URL(url);
    // Remove default ports
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    // Lowercase hostname, remove trailing slash from pathname
    let normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
    if (parsed.port) normalized += `:${parsed.port}`;
    normalized += parsed.pathname.replace(/\/+$/, '') || '';
    return normalized;
  } catch {
    // If URL parsing fails, just normalize trailing slashes
    return url.replace(/\/+$/, '');
  }
}

/**
 * Generate a cache key for provider instances.
 * URLs are normalized for consistent caching.
 */
function getCacheKey(type: ProviderType, config?: ProviderConfig): string {
  const baseUrl = normalizeUrl(config?.baseUrl || 'default');
  const tokenHash = hashToken(config?.token || config?.authInfo?.token);
  return `${type}:${baseUrl}:${tokenHash}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a provider instance for the given type and configuration.
 *
 * Provider instances are cached per type/baseUrl/token combination for reuse.
 *
 * @param type - Provider type (default: 'github')
 * @param config - Provider configuration
 * @returns Provider instance
 * @throws Error if provider type is not registered
 *
 * @example
 * ```typescript
 * // Get default GitHub provider
 * const github = getProvider('github');
 *
 * // Get GitLab provider with custom base URL
 * const gitlab = getProvider('gitlab', {
 *   type: 'gitlab',
 *   baseUrl: 'https://gitlab.mycompany.com',
 *   token: process.env.GITLAB_TOKEN,
 * });
 * ```
 */
export function getProvider(
  type: ProviderType = 'github',
  config?: ProviderConfig
): ICodeHostProvider {
  const cacheKey = getCacheKey(type, config);

  // Return cached instance if available and not expired
  const cached = instanceCache.get(cacheKey);
  if (cached && isProviderCacheValid(cached)) {
    return cached.provider;
  }

  // Remove expired entry if present
  if (cached) {
    instanceCache.delete(cacheKey);
  }

  // Get provider class from registry
  const ProviderClass = providerRegistry.get(type);
  if (!ProviderClass) {
    const available = [...providerRegistry.keys()].join(', ') || 'none';
    throw new Error(
      `Unknown provider type: '${type}'. Available providers: ${available}`
    );
  }

  // Create new instance
  const provider = new ProviderClass({
    ...config,
    type,
  });

  // Cache with timestamp and return
  instanceCache.set(cacheKey, {
    provider,
    createdAt: Date.now(),
  });
  return provider;
}

/**
 * Register a provider class.
 *
 * Called during module initialization to register available providers.
 *
 * @param type - Provider type identifier
 * @param providerClass - Provider class constructor
 *
 * @example
 * ```typescript
 * registerProvider('github', GitHubProvider);
 * registerProvider('gitlab', GitLabProvider);
 * ```
 */
export function registerProvider(
  type: ProviderType,
  providerClass: new (config?: ProviderConfig) => ICodeHostProvider
): void {
  providerRegistry.set(type, providerClass);
}

/**
 * Check if a provider type is registered.
 *
 * @param type - Provider type to check
 * @returns True if provider is registered
 */
export function isProviderRegistered(type: ProviderType): boolean {
  return providerRegistry.has(type);
}

/**
 * Get all registered provider types.
 *
 * @returns Array of registered provider types
 */
export function getRegisteredProviders(): ProviderType[] {
  return [...providerRegistry.keys()];
}

/**
 * Clear the provider instance cache.
 *
 * Useful for testing or when tokens change.
 */
export function clearProviderCache(): void {
  instanceCache.clear();
}

/**
 * Clear a specific provider instance from cache.
 *
 * @param type - Provider type
 * @param config - Configuration used when creating the provider
 */
export function clearProviderInstance(
  type: ProviderType,
  config?: ProviderConfig
): void {
  const cacheKey = getCacheKey(type, config);
  instanceCache.delete(cacheKey);
}

// ============================================================================
// PROVIDER INITIALIZATION
// ============================================================================

/**
 * Initialize all providers.
 *
 * This function dynamically imports and registers all available providers.
 * Called during server startup.
 */
export async function initializeProviders(): Promise<void> {
  // Import and register GitHub provider
  try {
    const { GitHubProvider } = await import('./github/GitHubProvider.js');
    registerProvider('github', GitHubProvider);
  } catch {
    // GitHub provider initialization failed - will be unavailable
  }

  // Import and register GitLab provider
  try {
    const { GitLabProvider } = await import('./gitlab/GitLabProvider.js');
    registerProvider('gitlab', GitLabProvider);
  } catch {
    // GitLab provider is optional - don't fail if not available
  }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Default provider type.
 */
export const DEFAULT_PROVIDER: ProviderType = 'github';

/**
 * Extract provider type from a query, with default fallback.
 */
export function extractProviderFromQuery(query: {
  provider?: ProviderType;
}): ProviderType {
  return query.provider || DEFAULT_PROVIDER;
}
