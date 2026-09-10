import { fetchWithRetries } from '../http/fetch.js';
import { withDataCache } from '../http/cache/dataCache.js';
import { generateCacheKey } from '../http/cache/key.js';
import { ArtifactProviderError, type ArtifactType } from './types.js';

export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function total(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function invalidResponse(type: ArtifactType): never {
  throw new ArtifactProviderError(
    'provider_error',
    `${type} returned an invalid registry response.`
  );
}

export function requiredString(value: unknown, type: ArtifactType): string {
  return string(value) ?? invalidResponse(type);
}

export function rows(value: unknown, type: ArtifactType): JsonObject[] {
  if (!Array.isArray(value)) return invalidResponse(type);
  return value.map(item => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return invalidResponse(type);
    }
    return item as JsonObject;
  });
}

export function url(value: unknown): string | undefined {
  const text = string(value);
  if (!text) return undefined;
  try {
    const parsed = new URL(text.replace(/^git\+/, ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function license(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return (
      value
        .filter((item): item is string => typeof item === 'string')
        .join(' OR ') || undefined
    );
  }
  return string(value);
}

export function endpoint(
  base: string,
  params: Record<string, string | number | undefined>
): string {
  const result = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) result.searchParams.set(key, String(value));
  }
  return result.href;
}

/** Encode each coordinate segment without allowing paths to escape the fixed API root. */
export function coordinatePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

export function registryJson(
  type: ArtifactType,
  requestUrl: string,
  notFoundIsEmpty = false
): Promise<unknown | undefined> {
  return registryData(type, requestUrl, notFoundIsEmpty, 'json');
}

export async function registryText(
  type: ArtifactType,
  requestUrl: string,
  notFoundIsEmpty = false
): Promise<string | undefined> {
  const data = await registryData(type, requestUrl, notFoundIsEmpty, 'text');
  return data === undefined ? undefined : requiredString(data, type);
}

async function registryData(
  type: ArtifactType,
  requestUrl: string,
  notFoundIsEmpty: boolean,
  responseType: 'json' | 'text'
): Promise<unknown | undefined> {
  try {
    return await withDataCache(
      generateCacheKey('artifact-registry', { type, requestUrl, responseType }),
      () =>
        fetchWithRetries(requestUrl, {
          headers: {
            Accept:
              responseType === 'json' ? 'application/json' : 'application/xml',
          },
          responseType,
          rateLimitProvider: type,
          packageRegistry: type,
          signal: AbortSignal.timeout(20_000),
        }),
      { ttl: 300, cacheRole: 'helper' }
    );
  } catch (error) {
    const status = object(error).status;
    const httpStatus = typeof status === 'number' ? status : undefined;
    if (httpStatus === 404 && notFoundIsEmpty) return undefined;
    if (httpStatus === 401 || httpStatus === 403) {
      throw new ArtifactProviderError(
        'authentication',
        `${type} denied registry access.`,
        httpStatus
      );
    }
    if (httpStatus === 429) {
      throw new ArtifactProviderError(
        'rate_limit',
        `${type} rate limit reached. Retry later.`,
        httpStatus
      );
    }
    throw new ArtifactProviderError(
      'provider_error',
      `${type} registry request failed. Retry later.`,
      httpStatus
    );
  }
}
