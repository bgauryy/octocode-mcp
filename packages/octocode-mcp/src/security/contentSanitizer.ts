import { allRegexPatterns } from './regexes.js';
import type { SanitizationResult, ValidationResult } from '../types.js';

export class ContentSanitizer {
  public static sanitizeContent(
    content: string,
    filePath?: string
  ): SanitizationResult {
    // Guard: null/undefined content should not crash regex operations
    if (content == null || typeof content !== 'string') {
      return {
        content: content == null ? '' : String(content),
        hasSecrets: false,
        secretsDetected: [],
        warnings: [],
      };
    }

    const secretsResult = this.detectSecrets(content, filePath);

    return {
      content: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
      secretsDetected: secretsResult.secretsDetected,
      warnings: secretsResult.secretsDetected, // Alias
    };
  }

  private static detectSecrets(
    content: string,
    filePath?: string
  ): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    let sanitizedContent = content;
    const secretsDetectedSet = new Set<string>();

    try {
      for (const pattern of allRegexPatterns) {
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
      // Security: Fail-closed - assume secrets may be present if detection fails
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
    params: Record<string, unknown>,
    _depth = 0,
    _visited?: WeakSet<object>
  ): ValidationResult {
    if (!params || typeof params !== 'object') {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Invalid parameters: must be an object'],
      };
    }

    // Guard: depth limit prevents stack overflow on deeply nested objects
    if (_depth > 20) {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Maximum nesting depth exceeded'],
      };
    }

    // Guard: cycle detection prevents infinite recursion on circular refs
    const visited = _visited ?? new WeakSet<object>();
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
        let sanitizedValue = value;
        if (value.length > 10000) {
          warnings.add(
            `Parameter ${key} exceeds maximum length (10,000 characters)`
          );
          sanitizedValue = value.substring(0, 10000);
        }
        const secretsResult = this.detectSecrets(sanitizedValue);
        if (secretsResult.hasSecrets) {
          hasSecrets = true;
          secretsResult.secretsDetected.forEach(secret =>
            warnings.add(`Secrets detected in ${key}: ${secret}`)
          );
        }
        sanitizedParams[key] = secretsResult.sanitizedContent;
      } else if (Array.isArray(value)) {
        const truncated =
          value.length > 100
            ? (warnings.add(
                `Parameter ${key} array exceeds maximum length (100 items)`
              ),
              value.slice(0, 100))
            : value;
        sanitizedParams[key] = truncated.map(item => {
          if (typeof item === 'string') {
            const secretsResult = this.detectSecrets(item);
            if (secretsResult.hasSecrets) {
              hasSecrets = true;
              secretsResult.secretsDetected.forEach(secret =>
                warnings.add(`Secrets detected in ${key}[]: ${secret}`)
              );
            }
            return secretsResult.sanitizedContent;
          }
          return item;
        });
      } else if (value !== null && typeof value === 'object') {
        const nestedValidation = this.validateInputParameters(
          value as Record<string, unknown>,
          _depth + 1,
          visited
        );
        if (!nestedValidation.isValid) {
          hasValidationErrors = true;
          warnings.add(
            `Invalid nested object in parameter ${key}: ${nestedValidation.warnings.join(', ')}`
          );
          continue;
        }
        sanitizedParams[key] = nestedValidation.sanitizedParams;
        hasSecrets = hasSecrets || nestedValidation.hasSecrets;
      } else {
        sanitizedParams[key] = value;
      }
    }

    return {
      sanitizedParams,
      isValid: !hasValidationErrors, // Now actually validates
      hasSecrets: hasSecrets,
      warnings: Array.from(warnings),
    };
  }
}
