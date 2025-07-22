import crypto from 'crypto';

/**
 * Safe JSON parsing with type safety and error handling
 */
export function safeJsonParse<T>(
  input: string,
  context: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(input) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse JSON${context ? ` for ${context}` : ''}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Sanitize error messages to prevent information disclosure
 */
export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Remove file paths, stack traces, and other sensitive info
  return message
    .replace(/(?:\/[\w.-]+)+/g, '[PATH]') // Remove file paths
    .replace(/at\s+[\w.<>]+\s+\(.*\)/g, '[STACK]') // Remove stack traces
    .replace(/0x[a-f0-9]+/gi, '[MEMORY]') // Remove memory addresses
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]') // Remove IP addresses
    .replace(/[a-f0-9]{32,}/gi, '[HASH]'); // Remove long hashes
}

/**
 * Generate secure cache key with salt
 */
export function generateSecureCacheKey(
  prefix: string,
  params: unknown,
  options: { salt?: string; algorithm?: string } = {}
): string {
  const {
    salt = crypto.randomBytes(16).toString('hex'),
    algorithm = 'sha256',
  } = options;
  const paramString =
    typeof params === 'string' ? params : JSON.stringify(params);

  return crypto
    .createHash(algorithm)
    .update(prefix)
    .update(paramString)
    .update(salt)
    .digest('hex');
}

/**
 * Validate resource limits
 */
export function validateResourceLimits(options: {
  size?: number;
  maxSize?: number;
  count?: number;
  maxCount?: number;
  name: string;
}): { isValid: boolean; error?: string } {
  const { size, maxSize, count, maxCount, name } = options;

  if (size !== undefined && maxSize !== undefined && size > maxSize) {
    return {
      isValid: false,
      error: `${name} size ${size} exceeds maximum allowed size of ${maxSize}`,
    };
  }

  if (count !== undefined && maxCount !== undefined && count > maxCount) {
    return {
      isValid: false,
      error: `${name} count ${count} exceeds maximum allowed count of ${maxCount}`,
    };
  }

  return { isValid: true };
}

/**
 * Resource size constants
 */
export const RESOURCE_LIMITS = {
  MAX_FILE_SIZE: 300 * 1024, // 300KB
  MAX_JSON_SIZE: 1024 * 1024, // 1MB
  MAX_ARRAY_LENGTH: 1000,
  MAX_STRING_LENGTH: 10000,
} as const;
