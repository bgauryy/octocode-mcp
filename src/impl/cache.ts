import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import NodeCache from 'node-cache';
import crypto from 'crypto';

const cache = new NodeCache({
  stdTTL: 86400, // 24 hour cache
  checkperiod: 3600, // Check for expired keys every 1 hour
});

export function generateCacheKey(prefix: string, params: any): string {
  const paramString = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('md5').update(paramString).digest('hex');
  return `${prefix}:${hash}`;
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
