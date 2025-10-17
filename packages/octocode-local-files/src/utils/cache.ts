import NodeCache from 'node-cache';
import crypto from 'crypto';

const cache = new NodeCache({
  stdTTL: 900, // 15 minutes
  checkperiod: 300, // Check every 5 minutes
  maxKeys: 500,
  deleteOnExpire: true,
  useClones: false,
});

export function generateCacheKey(prefix: string, params: unknown): string {
  const paramString = createStableParamString(params);
  const hash = crypto.createHash('sha256').update(paramString).digest('hex');
  return `${prefix}:${hash}`;
}

function createStableParamString(params: unknown): string {
  if (params === null) return 'null';
  if (params === undefined) return 'undefined';
  if (typeof params !== 'object') return String(params);
  if (Array.isArray(params)) {
    return `[${params.map(createStableParamString).join(',')}]`;
  }
  const sortedKeys = Object.keys(params as Record<string, unknown>).sort();
  const sortedEntries = sortedKeys.map((key) => {
    const value = (params as Record<string, unknown>)[key];
    return `"${key}":${createStableParamString(value)}`;
  });
  return `{${sortedEntries.join(',')}}`;
}

export async function withDataCache<T>(
  cacheKey: string,
  operation: () => Promise<T>,
  options: {
    ttl?: number;
    skipCache?: boolean;
    forceRefresh?: boolean;
    shouldCache?: (value: T) => boolean;
  } = {}
): Promise<T> {
  if (options.skipCache) {
    return await operation();
  }

  if (!options.forceRefresh) {
    const cached = cache.get<T>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = await operation();

  const shouldCache = options.shouldCache ?? (() => true);
  if (shouldCache(result)) {
    const ttl = options.ttl ?? 900;
    cache.set(cacheKey, result, ttl);
  }

  return result;
}

export function clearAllCache(): void {
  cache.flushAll();
}
