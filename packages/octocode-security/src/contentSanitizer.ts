import { allRegexPatterns } from './regexes/index.js';
import type { SensitiveDataPattern } from './regexes/types.js';
import type { SanitizationResult, ValidationResult } from './types.js';
import { securityRegistry } from './registry.js';

function getAllPatterns(
  explicit?: SensitiveDataPattern[]
): SensitiveDataPattern[] {
  const base = explicit ?? allRegexPatterns;
  const extra = securityRegistry.extraSecretPatterns;
  return extra.length > 0 ? [...base, ...extra] : base;
}

export class ContentSanitizer {
  /** Sanitize a single string value, enforcing max length and scanning for secrets. */
  private static sanitizeStringValue(
    key: string,
    value: string,
    warnings: Set<string>
  ): { sanitized: string; hasSecrets: boolean } {
    let sanitizedValue = value;
    if (value.length > 10000) {
      warnings.add(
        `Parameter ${key} exceeds maximum length (10,000 characters)`
      );
      sanitizedValue = value.substring(0, 10000);
    }
    const secretsResult = this.detectSecrets(sanitizedValue);
    if (secretsResult.hasSecrets) {
      secretsResult.secretsDetected.forEach(secret =>
        warnings.add(`Secrets detected in ${key}: ${secret}`)
      );
    }
    return {
      sanitized: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
    };
  }

  /** Sanitize a single array item (string or nested object). */
  private static sanitizeArrayItem(
    key: string,
    item: unknown,
    depth: number,
    visited: WeakSet<object>,
    warnings: Set<string>
  ): { sanitized: unknown; hasSecrets: boolean; hasValidationErrors: boolean } {
    if (typeof item === 'string') {
      const secretsResult = this.detectSecrets(item);
      if (secretsResult.hasSecrets) {
        secretsResult.secretsDetected.forEach(secret =>
          warnings.add(`Secrets detected in ${key}[]: ${secret}`)
        );
      }
      return {
        sanitized: secretsResult.sanitizedContent,
        hasSecrets: secretsResult.hasSecrets,
        hasValidationErrors: false,
      };
    }
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const nestedValidation = this.validateRecursive(
        item as Record<string, unknown>,
        depth + 1,
        visited
      );
      if (!nestedValidation.isValid) {
        nestedValidation.warnings.forEach(w => warnings.add(`${key}[]: ${w}`));
      }
      return {
        sanitized: nestedValidation.sanitizedParams,
        hasSecrets: nestedValidation.hasSecrets,
        hasValidationErrors: !nestedValidation.isValid,
      };
    }
    return { sanitized: item, hasSecrets: false, hasValidationErrors: false };
  }

  /** Sanitize an array parameter, enforcing max item count. */
  private static sanitizeArrayValue(
    key: string,
    value: unknown[],
    depth: number,
    visited: WeakSet<object>,
    warnings: Set<string>
  ): {
    sanitized: unknown[];
    hasSecrets: boolean;
    hasValidationErrors: boolean;
  } {
    const truncated =
      value.length > 100
        ? (warnings.add(
            `Parameter ${key} array exceeds maximum length (100 items)`
          ),
          value.slice(0, 100))
        : value;
    let hasSecrets = false;
    let hasValidationErrors = false;
    const sanitized = truncated.map(item => {
      const result = this.sanitizeArrayItem(
        key,
        item,
        depth,
        visited,
        warnings
      );
      if (result.hasSecrets) hasSecrets = true;
      if (result.hasValidationErrors) hasValidationErrors = true;
      return result.sanitized;
    });
    return { sanitized, hasSecrets, hasValidationErrors };
  }

  /** Sanitize a nested object parameter. */
  private static sanitizeNestedObject(
    key: string,
    value: Record<string, unknown>,
    depth: number,
    visited: WeakSet<object>,
    warnings: Set<string>
  ): {
    sanitized: Record<string, unknown> | null;
    hasSecrets: boolean;
    isValid: boolean;
  } {
    const nestedValidation = this.validateRecursive(value, depth + 1, visited);
    if (!nestedValidation.isValid) {
      warnings.add(
        `Invalid nested object in parameter ${key}: ${nestedValidation.warnings.join(', ')}`
      );
      return {
        sanitized: null,
        hasSecrets: nestedValidation.hasSecrets,
        isValid: false,
      };
    }
    return {
      sanitized: nestedValidation.sanitizedParams,
      hasSecrets: nestedValidation.hasSecrets,
      isValid: true,
    };
  }

  public static sanitizeContent(
    content: string,
    filePath?: string,
    patterns?: SensitiveDataPattern[]
  ): SanitizationResult {
    if (content == null || typeof content !== 'string') {
      return {
        content: content == null ? '' : String(content),
        hasSecrets: false,
        secretsDetected: [],
        warnings: [],
      };
    }

    const secretsResult = this.detectSecrets(
      content,
      filePath,
      getAllPatterns(patterns)
    );

    return {
      content: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
      secretsDetected: secretsResult.secretsDetected,
      warnings:
        secretsResult.secretsDetected.length > 0
          ? [`${secretsResult.secretsDetected.length} secret(s) redacted`]
          : [],
    };
  }

  private static readonly CHUNK_SIZE = 500_000;
  private static readonly CHUNK_OVERLAP = 1_000;

  private static detectSecrets(
    content: string,
    filePath?: string,
    patterns: SensitiveDataPattern[] = allRegexPatterns
  ): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    if (content.length > this.CHUNK_SIZE) {
      return this.detectSecretsChunked(content, filePath, patterns);
    }
    return this.detectSecretsInChunk(content, filePath, patterns);
  }

  private static detectSecretsChunked(
    content: string,
    filePath: string | undefined,
    patterns: SensitiveDataPattern[]
  ): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    const secretsDetectedSet = new Set<string>();
    let sanitizedContent = content;

    for (const pattern of patterns) {
      if (
        pattern.fileContext &&
        (!filePath || !pattern.fileContext.test(filePath))
      ) {
        continue;
      }
      try {
        let chunkStart = 0;
        while (chunkStart < sanitizedContent.length) {
          const chunkEnd = Math.min(
            chunkStart + this.CHUNK_SIZE,
            sanitizedContent.length
          );
          const chunk = sanitizedContent.slice(chunkStart, chunkEnd);
          const chunkMatches = chunk.match(pattern.regex);
          if (chunkMatches && chunkMatches.length > 0) {
            secretsDetectedSet.add(pattern.name);
            const replacement = `[REDACTED-${pattern.name.toUpperCase()}]`;
            for (const m of chunkMatches) {
              const idx = sanitizedContent.indexOf(m, chunkStart);
              if (idx !== -1) {
                sanitizedContent =
                  sanitizedContent.slice(0, idx) +
                  replacement +
                  sanitizedContent.slice(idx + m.length);
              }
            }
          }
          const next = chunkEnd - this.CHUNK_OVERLAP;
          if (next <= chunkStart) break;
          chunkStart = next;
        }
      } catch {
        return {
          hasSecrets: true,
          secretsDetected: ['detection-error'],
          sanitizedContent: '[CONTENT-REDACTED-DETECTION-ERROR]',
        };
      }
    }

    const secretsDetected = Array.from(secretsDetectedSet);
    return {
      hasSecrets: secretsDetected.length > 0,
      secretsDetected,
      sanitizedContent,
    };
  }

  private static detectSecretsInChunk(
    content: string,
    filePath: string | undefined,
    patterns: SensitiveDataPattern[]
  ): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    let sanitizedContent = content;
    const secretsDetectedSet = new Set<string>();

    try {
      for (const pattern of patterns) {
        if (pattern.fileContext) {
          if (!filePath || !pattern.fileContext.test(filePath)) {
            continue;
          }
        }

        const matches = sanitizedContent.match(pattern.regex);
        if (matches && matches.length > 0) {
          matches.forEach(_match => secretsDetectedSet.add(pattern.name));
          sanitizedContent = sanitizedContent.replace(
            pattern.regex,
            `[REDACTED-${pattern.name.toUpperCase()}]`
          );
        }
      }
    } catch {
      return {
        hasSecrets: true,
        secretsDetected: ['detection-error'],
        sanitizedContent: '[CONTENT-REDACTED-DETECTION-ERROR]',
      };
    }

    const secretsDetected = Array.from(secretsDetectedSet);

    return {
      hasSecrets: secretsDetected.length > 0,
      secretsDetected,
      sanitizedContent,
    };
  }

  public static validateInputParameters(
    params: Record<string, unknown>
  ): ValidationResult {
    return this.validateRecursive(params, 0, new WeakSet<object>());
  }

  private static validateRecursive(
    params: Record<string, unknown>,
    depth: number,
    visited: WeakSet<object>
  ): ValidationResult {
    if (!params || typeof params !== 'object') {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Invalid parameters: must be an object'],
      };
    }

    if (depth > 20) {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Maximum nesting depth exceeded'],
      };
    }

    if (visited.has(params)) {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Circular reference detected'],
      };
    }
    visited.add(params);

    const sanitizedParams: Record<string, unknown> = {};
    const warnings = new Set<string>();
    let hasSecrets = false;
    let hasValidationErrors = false;

    for (const [key, value] of Object.entries(params)) {
      if (typeof key !== 'string' || key.trim() === '') {
        hasValidationErrors = true;
        warnings.add(`Invalid parameter key: ${key}`);
        continue;
      }

      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      if (dangerousKeys.includes(key)) {
        hasValidationErrors = true;
        warnings.add(`Dangerous parameter key blocked: ${key}`);
        continue;
      }

      if (typeof value === 'string') {
        const strResult = this.sanitizeStringValue(key, value, warnings);
        sanitizedParams[key] = strResult.sanitized;
        if (strResult.hasSecrets) hasSecrets = true;
      } else if (Array.isArray(value)) {
        const arrResult = this.sanitizeArrayValue(
          key,
          value,
          depth,
          visited,
          warnings
        );
        sanitizedParams[key] = arrResult.sanitized;
        if (arrResult.hasSecrets) hasSecrets = true;
        if (arrResult.hasValidationErrors) hasValidationErrors = true;
      } else if (value !== null && typeof value === 'object') {
        const objResult = this.sanitizeNestedObject(
          key,
          value as Record<string, unknown>,
          depth,
          visited,
          warnings
        );
        if (!objResult.isValid) {
          hasValidationErrors = true;
          continue;
        }
        sanitizedParams[key] = objResult.sanitized;
        if (objResult.hasSecrets) hasSecrets = true;
      } else {
        sanitizedParams[key] = value;
      }
    }

    return {
      sanitizedParams,
      isValid: !hasValidationErrors,
      hasSecrets: hasSecrets,
      warnings: Array.from(warnings),
    };
  }
}
