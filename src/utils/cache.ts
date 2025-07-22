import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import NodeCache from 'node-cache';
import { generateSecureCacheKey } from '../security/utils';

const cache = new NodeCache({
  stdTTL: 86400, // 24 hour cache
  checkperiod: 3600, // Check for expired keys every 1 hour
  maxKeys: 1000, // Limit cache to 1000 entries to prevent unbounded growth
  deleteOnExpire: true, // Automatically delete expired keys
});

/**
 * Generate a cache key for the given prefix and parameters
 */
export function generateCacheKey(prefix: string, params: unknown): string {
  // Sort object keys for deterministic hashing
  const normalizeParams = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeParams).sort();
    
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = normalizeParams(obj[key]);
    });
    return sorted;
  };

  const normalizedParams = normalizeParams(params);
  const paramString = JSON.stringify(normalizedParams);
  
  // Use a fixed salt for deterministic hashing (for testing consistency)
  const hash = generateSecureCacheKey(prefix, paramString, { salt: 'fixed-salt-for-testing' });
  
  // Return in expected format: v1-prefix:hash (truncate to 32 chars for consistency with tests)
  return `v1-${prefix}:${hash.substring(0, 32)}`;
}

export async function withCache(
  cacheKey: string,
  operation: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  // Check if result exists in cache
  const cachedResult = cache.get<CallToolResult>(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }
  // Execute operation
  const result = await operation();

  // Only cache successful responses
  if (!result.isError) {
    cache.set(cacheKey, result);
  }

  return result;
}

export function clearAllCache(): void {
  cache.flushAll();
}
