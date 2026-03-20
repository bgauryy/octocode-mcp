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

/** Provider cache TTL (1 hour) - providers are re-created after this time */
const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Maximum number of cached provider instances.
 * Prevents unbounded growth when many different tokens/base URLs are used.
 */
const MAX_PROVIDER_INSTANCES = 20;

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
  lastAccessedAt: number;
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

/**
 * Evict expired and excess provider instances.
 * Removes all expired entries first, then evicts least-recently-used
 * entries if still over MAX_PROVIDER_INSTANCES.
 */
function evictProviderInstances(): void {
  // 1. Remove expired entries
  for (const [key, entry] of instanceCache.entries()) {
    if (!isProviderCacheValid(entry)) {
      instanceCache.delete(key);
    }
  }

  // 2. If still over capacity, evict least-recently-used
  if (instanceCache.size > MAX_PROVIDER_INSTANCES) {
    const sorted = [...instanceCache.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
    );
    const excess = instanceCache.size - MAX_PROVIDER_INSTANCES;
    for (let i = 0; i < excess && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) instanceCache.delete(entry[0]);
    }
  }
}

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
    // URL parser already strips default ports (443/https, 80/http)
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

  const cached = instanceCache.get(cacheKey);
  if (cached && isProviderCacheValid(cached)) {
    cached.lastAccessedAt = Date.now();
    return cached.provider;
  }

  // Remove expired entry if present
  if (cached) {
    instanceCache.delete(cacheKey);
  }

  // Evict expired and excess entries before adding a new one
  if (instanceCache.size >= MAX_PROVIDER_INSTANCES) {
    evictProviderInstances();
  }

  const ProviderClass = providerRegistry.get(type);
  if (!ProviderClass) {
    const available = [...providerRegistry.keys()].join(', ') || 'none';
    throw new Error(
      `Unknown provider type: '${type}'. Available providers: ${available}`
    );
  }

  const provider = new ProviderClass({
    ...config,
    type,
  });

  const now = Date.now();
  instanceCache.set(cacheKey, {
    provider,
    createdAt: now,
    lastAccessedAt: now,
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

export interface ProviderDiagnostic {
  provider: string;
  ok: boolean;
  error?: string;
}

type ProviderClass = new (config?: ProviderConfig) => ICodeHostProvider;

async function tryInitProvider(
  name: ProviderType,
  loader: () => Promise<Record<string, unknown>>,
  key: string
): Promise<ProviderDiagnostic> {
  try {
    const mod = await loader();
    registerProvider(name, mod[key] as ProviderClass);
    return { provider: name, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `⚠️  ${name} provider failed to initialize: ${message}\n`
    );
    return { provider: name, ok: false, error: message };
  }
}

/**
 * Initialize all providers.
 *
 * Dynamically imports and registers all available providers.
 * Called during server startup. Returns diagnostics so callers can observe
 * partial failures instead of having them silently swallowed.
 */
export async function initializeProviders(): Promise<ProviderDiagnostic[]> {
  return Promise.all([
    tryInitProvider(
      'github',
      () => import('./github/GitHubProvider.js'),
      'GitHubProvider'
    ),
    tryInitProvider(
      'gitlab',
      () => import('./gitlab/GitLabProvider.js'),
      'GitLabProvider'
    ),
    tryInitProvider(
      'bitbucket',
      () => import('./bitbucket/BitbucketProvider.js'),
      'BitbucketProvider'
    ),
  ]);
}

/**
 * Default provider type.
 */
export const DEFAULT_PROVIDER: ProviderType = 'github';
