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

/**
 * Registry of provider classes by type.
 * Providers register themselves during module initialization.
 */
const providerRegistry = new Map<
  ProviderType,
  new (config?: ProviderConfig) => ICodeHostProvider
>();

/**
 * Cache of provider instances.
 * Key format: `${type}:${baseUrl}:${tokenHash}`
 */
const instanceCache = new Map<string, ICodeHostProvider>();

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
 * Generate a cache key for provider instances.
 */
function getCacheKey(type: ProviderType, config?: ProviderConfig): string {
  const baseUrl = config?.baseUrl || 'default';
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

  // Return cached instance if available
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
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

  // Cache and return
  instanceCache.set(cacheKey, provider);
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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize GitHub provider:', error);
  }

  // Import and register GitLab provider
  try {
    const { GitLabProvider } = await import('./gitlab/GitLabProvider.js');
    registerProvider('gitlab', GitLabProvider);
  } catch (error) {
    // GitLab provider is optional - don't fail if not available
    // eslint-disable-next-line no-console
    console.warn('GitLab provider not available:', error);
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
