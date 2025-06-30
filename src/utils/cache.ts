import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import NodeCache from 'node-cache';
import crypto from 'crypto';

const VERSION = 'v1';

const cache = new NodeCache({
  stdTTL: 86400, // 24 hour cache
  checkperiod: 3600, // Check for expired keys every 1 hour
  maxKeys: 1000, // Limit cache to 1000 entries to prevent unbounded growth
  deleteOnExpire: true, // Automatically delete expired keys
});

export function generateCacheKey(prefix: string, params: unknown): string {
  const paramString = JSON.stringify(
    params,
    Object.keys(params as Record<string, unknown>).sort()
  );
  const hash = crypto.createHash('md5').update(paramString).digest('hex');
  return `${VERSION}-${prefix}:${hash}`;
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

export function getCacheStats() {
  return cache.getStats();
}
